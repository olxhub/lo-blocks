// packages/shared/lib/lofs/providers/network.ts
//
// Network storage provider - HTTP-based content access for Learning Observer.
//
// Enables Learning Observer to load content from remote servers via HTTP APIs,
// supporting scenarios like:
// - Content served from a separate CMS or authoring system
// - Multi-tenant deployments with shared content repositories
// - Content distribution networks for large-scale delivery
//
// The provider translates storage operations into HTTP requests against
// configurable endpoints, maintaining the same interface as local file storage.
//
import type { LofsRef, OlxRelativePath, SafeRelativePath } from '../../types';
import { isMediaFile } from '@/lib/util/fileTypes';
import { provenancePath, type NamespaceResolution } from '../../types/storage';
import { toLofsCanonical, withVersion, toLofsVersion } from '../../types/address';
import { hashContent } from '../../util';
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
} from '../../types/storage';

export interface NetworkProviderOptions {
  /** Endpoint for single-file operations (read/write/delete) */
  readEndpoint?: string;
  /** Endpoint for file listing and glob */
  listEndpoint?: string;
  /** Endpoint for grep */
  grepEndpoint?: string;
  /** Endpoint for image validation (HEAD requests) */
  imageEndpoint?: string;
}

export class NetworkStorageProvider implements StorageProvider {
  readEndpoint: string;
  listEndpoint: string;
  grepEndpoint: string;
  imageEndpoint: string;
  /** The source this provider edits, sent as `?source=` so the server routes
   *  via sourceProvider(origin). Undefined = union mode: reads/lists/searches
   *  span all sources (compile/preview). Writes require an origin — a union
   *  write has no well-defined target (that was the wrong-repo-save bug). */
  readonly origin: string | undefined;

  /**
   * @param origin - The source to scope to (omit for union/preview mode).
   * @param options - API endpoint configuration.
   *
   * @example
   * const studio = new NetworkStorageProvider(selectedOrigin);  // edits one repo
   * const preview = new NetworkStorageProvider();               // reads the union
   */
  constructor(origin?: string, options: NetworkProviderOptions = {}) {
    this.origin = origin;
    this.readEndpoint = (options.readEndpoint ?? '/api/file').replace(/\/$/, '');
    this.listEndpoint = (options.listEndpoint ?? '/api/files').replace(/\/$/, '');
    this.grepEndpoint = (options.grepEndpoint ?? '/api/grep').replace(/\/$/, '');
    // Static assets are served from the Next public mount, not the LOFS source.
    this.imageEndpoint = (options.imageEndpoint ?? '/content').replace(/\/$/, '');
  }

  /** Request params for a path op, carrying the scoped source when set. */
  private params(path?: string): URLSearchParams {
    const p = new URLSearchParams();
    if (path) p.set('path', path);
    if (this.origin) p.set('source', this.origin);
    return p;
  }

  /**
   * Resolve a relative path against a base provenance URI.
   * Works client-side by manipulating path strings.
   */
  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // Extract logical path from provenance URI using standard URL parsing.
    let basePath: string;
    if (baseProvenance.includes('://')) {
      basePath = provenancePath(baseProvenance);
    } else {
      basePath = baseProvenance;
    }

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
    // network:// ref (union/preview). Real provenance comes from the server.
    return (this.origin ? `${this.origin}://${safePath}` : `network://${safePath}`) as LofsRef;
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return provenancePath(uri) as OlxRelativePath;
  }

  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    // Content namespaces are resolved server-side during content sync;
    // qualified DefinitionKeys arrive over the wire. Client-side parses
    // (editor, inline) get their namespace from the caller, not the provider.
    throw new Error(
      `NetworkStorageProvider cannot resolve content namespaces (asked about: ${ref}). ` +
      `The server resolves namespaces when syncing content.`
    );
  }

  /**
   * Check if an asset file exists via HEAD request.
   */
  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    if (!isMediaFile(assetPath)) {
      return false;
    }

    try {
      const res = await fetch(`${this.imageEndpoint}/${assetPath}`, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Incremental file scanning is not supported over network.
   *
   * This would require streaming large amounts of metadata from the server
   * and maintaining state about previous scans. For network deployments,
   * use listFiles() + read() instead, or implement server-side change detection.
   */
  async loadXmlFilesWithStats(
    _prev: Record<LofsRef, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error(
      'NetworkStorageProvider does not support incremental file scanning. ' +
      'Use listFiles() to get current file tree, or implement change detection server-side.'
    );
  }

  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(selection)) {
      if (value != null) params.set(key, String(value));
    }
    if (this.origin) params.set('source', this.origin);
    const url = params.toString()
      ? `${this.listEndpoint}?${params.toString()}`
      : this.listEndpoint;
    const json = await this.request(url);
    return json.tree as UriNode;
  }

  /**
   * One fetch + envelope-unwrap for every endpoint. The transport's two failure
   * modes live here: a network-level rejection (server unreachable — fetch
   * throws before any response) becomes a clear message instead of the browser's
   * opaque "NetworkError…"; an { ok:false } envelope throws its error, or a
   * VersionConflictError on a save conflict. Returns the parsed json.
   *
   * TODO: this should grow into the ONE universal client fetch, not stay one of
   * three — the others are fetchOlxJson's `globalThis.fetch` (×3) and StudioPage's
   * `/api/sources`. (The dead `lib/api.ts`, git rm'd, was a stalled attempt.) Fold
   * them in here. Soft list to (re)check when we do — figure out the shape then:
   *   - request metadata: i18n (Accept-Language), auth, etc.
   *   - error handling wired to one shared "no connection" signal
   *   - JSON decoding + the { ok, error, conflict } envelope
   *   - easy integration with hooks (reactivity)
   */
  private async request(url: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new Error("Can't reach the content server — is it running?");
    }
    const json = await res.json();
    if (!json.ok) {
      if (json.conflict) {
        throw new VersionConflictError(json.error, json.metadata);
      }
      throw new Error(json.error ?? 'Request failed');
    }
    return json;
  }

  async read(path: OlxRelativePath): Promise<ReadResult> {
    const json = await this.request(`${this.readEndpoint}?${this.params(path).toString()}`);
    const content = json.content as string;
    const ref = this.toLofsRef(path as unknown as SafeRelativePath);
    const ver = toLofsVersion(await hashContent(content));
    return {
      content,
      metadata: json.metadata,
      provenance: toLofsCanonical(withVersion(ref, ver)),
      // Server-resolved content namespace (see api/file GET).
      ns: json.ns,
    };
  }

  async write(path: OlxRelativePath, content: string, options: WriteOptions = {}): Promise<void> {
    const { previousMetadata, force = false } = options;
    await this.request(this.readEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, source: this.origin, content, previousMetadata, force }),
    });
  }


  async delete(path: OlxRelativePath): Promise<void> {
    await this.request(`${this.readEndpoint}?${this.params(path).toString()}`, { method: 'DELETE' });
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    await this.request(this.readEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: oldPath, newPath, source: this.origin }),
    });
  }

  /**
   * Find files matching a glob pattern.
   * Returns repo-relative paths within the scoped source (or the union).
   */
  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    // No basePath → search from the source root (omit the param).
    const params = this.params(basePath);
    params.set('pattern', pattern);

    const json = await this.request(`${this.listEndpoint}?${params.toString()}`);
    return json.files as OlxRelativePath[];
  }

  /**
   * Search file contents for a pattern.
   * Returns matches with repo-relative paths within the scoped source (or union).
   */
  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    // No basePath → search from the source root (omit the param).
    const params = this.params(options.basePath);
    params.set('pattern', pattern);
    if (options.include) params.set('include', options.include);
    if (options.limit) params.set('limit', String(options.limit));

    const json = await this.request(`${this.grepEndpoint}?${params.toString()}`);
    return json.matches as GrepMatch[];
  }
}
