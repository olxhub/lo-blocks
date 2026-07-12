// packages/shared/lib/lofs/providers/mcp.ts
//
// MCP storage provider — content access over the /mcp endpoint's LOFS tools
// (lib/lofs/tools.ts). The browser-side face of the one edit path: Studio,
// the chat agent, and external MCP clients (Claude Code / Desktop) all
// perform the same operations against the same server-side tool definitions.
//
// Replaces NetworkStorageProvider (which spoke the retired /api/file,
// /api/files, /api/grep REST routes).
//
import type { LofsRef, OlxRelativePath, SafeRelativePath, LofsOrigin } from '../../types';
import { isMediaFile } from '@/lib/util/fileTypes';
import { provenancePath, type NamespaceResolution } from '../../types/storage';
import { toLofsRef, toLofsCanonical } from '../../types/address';
import { callMcpTool } from '../../mcp/client';
import {
  type StorageProvider,
  type ContentFile,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type FileChange,
  type CommitOptions,
  type CommitResult,
  type GrepOptions,
  type GrepMatch,
  VersionConflictError,
} from '../../types/storage';

/** Wire shape of the Write tool's structured conflict result. */
interface WriteConflict {
  ok: false;
  conflict: true;
  error: string;
  metadata?: unknown;
}
type WriteResult = { ok: true } | WriteConflict;

export class McpStorageProvider implements StorageProvider {
  /** The source this provider edits, sent as `source` so the server routes
   *  via sourceProvider(origin). Undefined = union mode: reads/lists/searches
   *  span all sources (compile/preview). Writes require an origin — a union
   *  write has no well-defined target. */
  readonly origin: LofsOrigin | undefined;
  /** Static assets are served from the public content mount, not over MCP. */
  readonly assetEndpoint: string;

  /**
   * @param origin - The source to scope to, already branded (omit for
   *   union/preview mode). The caller brands once at its boundary.
   *
   * @example
   * const studio = new McpStorageProvider(selectedOrigin);  // edits one repo
   * const preview = new McpStorageProvider();               // reads the union
   */
  constructor(origin?: LofsOrigin, { assetEndpoint = '/content' }: { assetEndpoint?: string } = {}) {
    this.origin = origin;
    this.assetEndpoint = assetEndpoint.replace(/\/$/, '');
  }

  /** Tool args for a path op, carrying the scoped source when set. */
  private args(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return this.origin ? { source: this.origin, ...extra } : { ...extra };
  }

  async read(path: OlxRelativePath): Promise<ReadResult> {
    // retry: read-only, safe across an expired MCP session.
    const json = await callMcpTool<{ content: string; metadata?: unknown; ns?: string; provenance: string }>(
      'Read', this.args({ path }), { retry: true });
    return {
      content: json.content,
      metadata: json.metadata,
      // Server-resolved canonical provenance (source://path#version).
      provenance: toLofsCanonical(toLofsRef(json.provenance)),
      ns: json.ns as ReadResult['ns'],
    };
  }

  /**
   * The client-side write doorway. Maps the change onto the LOFS tools
   * (Write / Delete / Move) — the SAME contract Studio, the chat agent, and
   * external MCP clients speak. No batch tool exists, so this face handles ONE
   * change per commit (the only shape its callers issue); atomic multi-change
   * lands on the server-side providers (git/file). `versions` is empty (the
   * tool contract returns no token; the client re-reads for the fresh one),
   * and a Write conflict is re-thrown as VersionConflictError like the locals.
   */
  async commit(changes: FileChange[], options: CommitOptions = {}): Promise<CommitResult> {
    if (changes.length !== 1) {
      throw new Error(
        `McpStorageProvider.commit handles one change at a time (got ${changes.length}); ` +
        `the MCP tool contract has no atomic multi-change write.`);
    }
    const [c] = changes;
    if (c.delete) {
      await callMcpTool('Delete', this.args({ path: c.path }));
    } else if (c.renameTo !== undefined) {
      await callMcpTool('Move', this.args({ path: c.path, new_path: c.renameTo }));
    } else if (c.content !== undefined) {
      const base = options.base?.find(b => String(b.path) === String(c.path));
      // No retry: a write must not be replayed blind.
      const result = await callMcpTool<WriteResult>('Write', this.args({
        path: c.path,
        content: c.content,
        previous_metadata: base?.version,
        force: options.force ?? false,
        create: options.create ?? false,
      }));
      if (!result.ok) {
        throw new VersionConflictError(result.error, result.metadata);
      }
    } else {
      throw new Error(`Empty change for "${c.path}": set content, delete, or renameTo`);
    }
    return { versions: {} };
  }

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    const json = await callMcpTool<{ files: string[] }>(
      'Glob', this.args({ pattern, ...(basePath ? { path: basePath } : {}) }), { retry: true });
    return json.files as OlxRelativePath[];
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const json = await callMcpTool<{ matches: GrepMatch[] }>('Grep', this.args({
      pattern,
      ...(options.basePath ? { path: options.basePath } : {}),
      ...(options.include ? { include: options.include } : {}),
      ...(options.limit ? { limit: options.limit } : {}),
    }), { retry: true });
    return json.matches;
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    const json = await callMcpTool<{ tree: UriNode }>('list_files', this.args(), { retry: true });
    return json.tree;
  }

  /**
   * Resolve a relative path against a base provenance URI.
   * Works client-side by manipulating path strings.
   */
  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // A provenance ref always carries "://" (origin + path), so take the path.
    const basePath = provenancePath(baseProvenance);

    // Get directory of base file
    const lastSlash = basePath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : '';

    // Resolve relative path
    const parts = (baseDir + '/' + relativePath).split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        if (resolved.length === 0) {
          throw new Error(`Path traversal above root: "${relativePath}" from "${baseProvenance}"`);
        }
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    return resolved.join('/') as SafeRelativePath;
  }

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    // Client-side synthetic ref: scoped to the origin when set, else a bare
    // mcp:// ref (union/preview). Real provenance comes from the server.
    return (this.origin ? `${this.origin}://${safePath}` : `mcp://${safePath}`) as LofsRef;
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return provenancePath(uri) as OlxRelativePath;
  }

  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    // Content namespaces are resolved server-side during content sync;
    // qualified DefinitionKeys arrive over the wire. Client-side parses
    // (editor, inline) get their namespace from the caller, not the provider.
    throw new Error(
      `McpStorageProvider cannot resolve content namespaces (asked about: ${ref}). ` +
      `The server resolves namespaces when syncing content.`
    );
  }

  /**
   * Check if an asset file exists via HEAD request against the public
   * content mount (assets aren't served over MCP).
   */
  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    if (!isMediaFile(assetPath)) {
      return false;
    }
    try {
      const res = await fetch(`${this.assetEndpoint}/${assetPath}`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Content enumeration is not supported over MCP.
   * Use listFiles() + read(); this is the CLIENT-side face, never a sync source.
   */
  async listContent(): Promise<ContentFile[]> {
    throw new Error(
      'McpStorageProvider does not support content enumeration. ' +
      'Use listFiles() to get the current file tree, or read() individual files.'
    );
  }

  /**
   * Not supported: this is the CLIENT-side content face over MCP, never a
   * server-side sync source (the sync runs over file/git providers). Change
   * detection would need a server round-trip and belongs there, not here.
   */
  async generationToken(): Promise<string> {
    throw new Error(
      'McpStorageProvider does not support generationToken (client-side content provider; not a sync source).'
    );
  }
}
