// packages/shared/lib/storage/lofs/providers/mcp.ts
//
// MCP storage provider — content access over the /mcp endpoint's LOFS tools
// (lib/storage/lofs/tools.ts). The browser-side face of the one edit path: Studio,
// the chat agent, and external MCP clients (Claude Code / Desktop) all
// perform the same operations against the same server-side tool definitions.
//
// Replaces NetworkStorageProvider (which spoke the retired /api/file,
// /api/files, /api/grep REST routes).
//
import type { LofsRef, OlxRelativePath, SafeRelativePath, LofsOrigin } from '../../../types';
import { isMediaFile } from '@/lib/util/fileTypes';
import { provenancePath, type NamespaceResolution } from '../../../types/storage';
import { toLofsRef, toLofsCanonical } from '../../../types/address';
import { callMcpTool } from '../../../mcp/client';
import {
  type StorageProvider,
  type XmlFileInfo,
  type XmlScanResult,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type WriteOptions,
  type GrepOptions,
  type GrepMatch,
  VersionConflictError,
} from '../../../types/storage';

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

  async save(path: OlxRelativePath, content: string, options: WriteOptions = {}): Promise<void> {
    const { previousMetadata, force = false, create = false } = options;
    // No retry: a write must not be replayed blind.
    const result = await callMcpTool<WriteResult>('Write', this.args({
      path,
      content,
      previous_metadata: previousMetadata,
      force,
      create,
    }));
    if (!result.ok) {
      throw new VersionConflictError(result.error, result.metadata);
    }
  }

  async remove(path: OlxRelativePath): Promise<void> {
    await callMcpTool('Delete', this.args({ path }));
  }

  async move(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    await callMcpTool('Move', this.args({ path: oldPath, new_path: newPath }));
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
   * Incremental file scanning is not supported over MCP.
   * Use listFiles() + read(), or implement change detection server-side.
   */
  async loadXmlFilesWithStats(
    _prev: Record<LofsRef, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error(
      'McpStorageProvider does not support incremental file scanning. ' +
      'Use listFiles() to get current file tree, or implement change detection server-side.'
    );
  }
}
