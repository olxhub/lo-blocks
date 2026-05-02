// src/lib/lofs/providers/postgres.ts
//
// Postgres storage provider - database-backed content persistence.
//
// Stores OLX/content files in a PostgreSQL table with multi-tenant support.
// Each tenant (namespace) gets its own row partition via the `tenant` column.
//
// Schema (create once per database):
//
//   CREATE TABLE lofs_files (
//     tenant     TEXT NOT NULL,
//     path       TEXT NOT NULL,
//     content    TEXT NOT NULL,
//     version    INTEGER NOT NULL DEFAULT 1,
//     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//     PRIMARY KEY (tenant, path)
//   );
//
// Change detection: version column increments on every write. Optimistic
// concurrency: writes fail if the version has changed since last read.
//
// PoC scope: read-write, single table. Caller owns the pg.Pool lifecycle.
//
import type { Pool } from 'pg';
import { minimatch } from 'minimatch';
import { isContentFile, getContentType } from '@/lib/util/fileTypes';
import type { ProvenanceURI, OlxRelativePath, SafeRelativePath, JSONValue } from '../../types';
import { scheme as addressScheme, toLofsAddress } from '../../types/address';
import { resolveRelativeToProvenance } from '../pathResolve';
import { grepContent } from '../searchUtils';
import type {
  StorageProvider,
  ContentNamespace,
  XmlFileInfo,
  XmlScanResult,
  UriNode,
  ReadResult,
  WriteOptions,
  GrepOptions,
  GrepMatch,
} from '../../types/storage';
import { VersionConflictError, toContentNamespace, toPgProvenanceURI } from '../../types/storage';

/** Row shape from the lofs_files table. */
interface FileRow {
  tenant: string;
  path: string;
  content: string;
  version: number;
  updated_at: Date;
}

export interface PostgresStorageProviderOptions {
  /** Namespace (default: tenant value). */
  namespace?: string;
  /** Whether to auto-create the table if it doesn't exist (default: false). */
  autoCreateTable?: boolean;
}

export class PostgresStorageProvider implements StorageProvider {
  readonly scheme = 'postgres' as const;
  readonly namespace: ContentNamespace;
  readonly writable = true;

  /** The database connection pool. Caller owns lifecycle. */
  readonly pool: Pool;
  /** Tenant identifier for multi-tenant isolation. */
  readonly tenant: string;
  /** Whether to auto-create the table. */
  private autoCreateTable: boolean;
  private tableCreated = false;

  constructor(pool: Pool, tenant: string, options: PostgresStorageProviderOptions = {}) {
    this.pool = pool;
    this.tenant = tenant;
    this.namespace = toContentNamespace(options.namespace ?? tenant);
    this.autoCreateTable = options.autoCreateTable ?? false;
  }

  /** Ensure the table exists (idempotent). */
  private async ensureTable(): Promise<void> {
    if (!this.autoCreateTable || this.tableCreated) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lofs_files (
        tenant     TEXT NOT NULL,
        path       TEXT NOT NULL,
        content    TEXT NOT NULL,
        version    INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant, path)
      )
    `);
    this.tableCreated = true;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async read(filePath: OlxRelativePath): Promise<ReadResult> {
    await this.ensureTable();
    const { rows } = await this.pool.query<FileRow>(
      'SELECT content, version, updated_at FROM lofs_files WHERE tenant = $1 AND path = $2',
      [this.tenant, filePath]
    );
    if (rows.length === 0) {
      throw new Error(`File not found: ${filePath}`);
    }
    const row = rows[0];
    return {
      content: row.content,
      metadata: { version: row.version, updated_at: row.updated_at.toISOString() },
      provenance: toPgProvenanceURI(this.tenant, filePath),
    };
  }

  // ---------------------------------------------------------------------------
  // Write (UPSERT with optimistic concurrency)
  // ---------------------------------------------------------------------------

  async write(filePath: OlxRelativePath, content: string, options: WriteOptions = {}): Promise<void> {
    await this.ensureTable();
    const { previousMetadata, force = false } = options;

    if (previousMetadata && !force) {
      const prev = previousMetadata as { version?: number };
      if (prev.version !== undefined) {
        // Optimistic concurrency: only update if version matches
        const { rowCount } = await this.pool.query(
          `UPDATE lofs_files
           SET content = $3, version = version + 1, updated_at = now()
           WHERE tenant = $1 AND path = $2 AND version = $3`,
          [this.tenant, filePath, prev.version]
        );
        if (rowCount === 0) {
          // Either the row doesn't exist or version changed
          const { rows } = await this.pool.query<FileRow>(
            'SELECT version, updated_at FROM lofs_files WHERE tenant = $1 AND path = $2',
            [this.tenant, filePath]
          );
          if (rows.length === 0) {
            throw new VersionConflictError('File was deleted');
          }
          throw new VersionConflictError(
            'File has been modified since last read',
            { version: rows[0].version, updated_at: rows[0].updated_at.toISOString() }
          );
        }
        return;
      }
    }

    // UPSERT: insert or update
    await this.pool.query(
      `INSERT INTO lofs_files (tenant, path, content, version, updated_at)
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (tenant, path)
       DO UPDATE SET content = $3, version = lofs_files.version + 1, updated_at = now()`,
      [this.tenant, filePath, content]
    );
  }

  // ---------------------------------------------------------------------------
  // Delete / Rename
  // ---------------------------------------------------------------------------

  async delete(filePath: OlxRelativePath): Promise<void> {
    await this.ensureTable();
    const { rowCount } = await this.pool.query(
      'DELETE FROM lofs_files WHERE tenant = $1 AND path = $2',
      [this.tenant, filePath]
    );
    if (rowCount === 0) {
      throw new Error(`File not found: ${filePath}`);
    }
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    await this.ensureTable();
    const { rowCount } = await this.pool.query(
      'UPDATE lofs_files SET path = $3, updated_at = now() WHERE tenant = $1 AND path = $2',
      [this.tenant, oldPath, newPath]
    );
    if (rowCount === 0) {
      throw new Error(`File not found: ${oldPath}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Scan for content files
  // ---------------------------------------------------------------------------

  async loadXmlFilesWithStats(
    previous: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    await this.ensureTable();
    const { rows } = await this.pool.query<FileRow>(
      'SELECT path, content, version, updated_at FROM lofs_files WHERE tenant = $1',
      [this.tenant]
    );

    const found: Record<ProvenanceURI, boolean> = {};
    const added: Record<ProvenanceURI, XmlFileInfo> = {};
    const changed: Record<ProvenanceURI, XmlFileInfo> = {};
    const unchanged: Record<ProvenanceURI, XmlFileInfo> = {};

    for (const row of rows) {
      if (!isContentFile(row.path)) continue;

      const uri = toPgProvenanceURI(this.tenant, row.path);
      found[uri] = true;

      const type = getContentType(row.path);
      const metadata = { version: row.version, updated_at: row.updated_at.toISOString() };

      const prev = previous[uri];
      if (prev) {
        const prevMeta = prev._metadata as { version?: number } | null;
        if (prevMeta?.version !== row.version) {
          changed[uri] = { id: uri, type, _metadata: metadata as unknown as JSONValue, content: row.content };
        } else {
          unchanged[uri] = prev;
        }
      } else {
        added[uri] = { id: uri, type, _metadata: metadata as unknown as JSONValue, content: row.content };
      }
    }

    const deleted: Record<ProvenanceURI, XmlFileInfo> = {};
    for (const id of Object.keys(previous) as ProvenanceURI[]) {
      if (!found[id]) {
        deleted[id] = previous[id];
      }
    }

    return { added, changed, unchanged, deleted };
  }

  // ---------------------------------------------------------------------------
  // File listing
  // ---------------------------------------------------------------------------

  async listFiles(): Promise<UriNode> {
    await this.ensureTable();
    const { rows } = await this.pool.query<{ path: string }>(
      'SELECT path FROM lofs_files WHERE tenant = $1 ORDER BY path',
      [this.tenant]
    );

    // Build tree from flat path list
    const root: UriNode = { uri: '', children: [] };
    for (const row of rows) {
      const parts = row.path.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const partPath = parts.slice(0, i + 1).join('/');
        if (i === parts.length - 1) {
          // Leaf (file)
          current.children!.push({ uri: partPath });
        } else {
          // Directory — find or create
          let dir = current.children!.find((c) => c.uri === partPath);
          if (!dir) {
            dir = { uri: partPath, children: [] };
            current.children!.push(dir);
          }
          current = dir;
        }
      }
    }

    return root;
  }

  // ---------------------------------------------------------------------------
  // Glob / Grep
  // ---------------------------------------------------------------------------

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    await this.ensureTable();
    const { rows } = await this.pool.query<{ path: string }>(
      'SELECT path FROM lofs_files WHERE tenant = $1 ORDER BY path',
      [this.tenant]
    );

    return rows
      .map((r) => r.path)
      .filter((p) => {
        if (basePath && !p.startsWith(basePath)) return false;
        const matchPath = basePath ? p.slice(basePath.length).replace(/^\//, '') : p;
        return minimatch(matchPath, pattern);
      }) as OlxRelativePath[];
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    await this.ensureTable();
    const { basePath, include, limit = 1000 } = options;
    const { rows } = await this.pool.query<FileRow>(
      'SELECT path, content FROM lofs_files WHERE tenant = $1',
      [this.tenant]
    );
    const files = rows.filter(row => {
      if (basePath && !row.path.startsWith(basePath)) return false;
      if (include && !minimatch(row.path, include)) return false;
      return true;
    });
    return grepContent(files, pattern, limit);
  }

  // ---------------------------------------------------------------------------
  // Path resolution / provenance
  // ---------------------------------------------------------------------------

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
    if (addressScheme(toLofsAddress(baseProvenance)) !== 'postgres') {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }
    return resolveRelativeToProvenance(baseProvenance, relativePath) as SafeRelativePath;
  }

  toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
    return toPgProvenanceURI(this.tenant, safePath);
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    try {
      const { isMediaFile } = await import('@/lib/util/fileTypes');
      if (!isMediaFile(assetPath)) return false;
      // Check if file exists in DB
      const { rows } = await this.pool.query(
        'SELECT 1 FROM lofs_files WHERE tenant = $1 AND path = $2',
        [this.tenant, assetPath]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
