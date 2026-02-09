// src/lib/lofs/providers/network.ts
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
import type { ProvenanceURI, OlxRelativePath, LofsPath } from '../../types';
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
} from '../types';

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
  namespace: string;

  /**
   * Create a NetworkStorageProvider that transforms OlxRelativePath to LofsPath.
   *
   * @param namespace - LOFS namespace prefix (e.g., "content") to prepend to paths
   * @param options - API endpoint configuration
   *
   * @example
   * // Studio calls:
   * const storage = new NetworkStorageProvider('content');
   * storage.read('demos/foo.olx')  // internally: 'content/demos/foo.olx'
   */
  constructor(namespace: string = 'content', options: NetworkProviderOptions = {}) {
    this.namespace = namespace;
    this.readEndpoint = (options.readEndpoint ?? '/api/file').replace(/\/$/, '');
    this.listEndpoint = (options.listEndpoint ?? '/api/files').replace(/\/$/, '');
    this.grepEndpoint = (options.grepEndpoint ?? '/api/grep').replace(/\/$/, '');
    this.imageEndpoint = (options.imageEndpoint ?? `/${namespace}`).replace(/\/$/, '');
  }

  /**
   * Convert OlxRelativePath to LofsPath by prepending namespace.
   *
   * @param olxRelativePath - Path as from OLX (e.g., "demos/foo.olx")
   * @returns LofsPath with namespace prefix (e.g., "content/demos/foo.olx")
   */
  private toLofsPath(olxRelativePath: OlxRelativePath): LofsPath {
    return `${this.namespace}/${olxRelativePath}` as LofsPath;
  }

  /**
   * Convert LofsPath back to OlxRelativePath by removing namespace prefix.
   *
   * @param lofsPath - Storage path with namespace (e.g., "content/demos/foo.olx")
   * @returns OlxRelativePath relative to namespace (e.g., "demos/foo.olx")
   * @throws Error if path doesn't match expected namespace
   */
  private fromLofsPath(lofsPath: LofsPath): OlxRelativePath {
    const prefix = `${this.namespace}/`;
    if (lofsPath.startsWith(prefix)) {
      return lofsPath.slice(prefix.length) as OlxRelativePath;
    }
    // Namespace mismatch is a bug - fail fast
    throw new Error(
      `NetworkStorageProvider namespace mismatch: expected path starting with "${prefix}" but got "${lofsPath}". ` +
      `This indicates the wrong storage provider was used or paths were corrupted.`
    );
  }

  /**
   * Resolve a relative path against a base provenance URI.
   * Works client-side by manipulating path strings.
   */
  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): string {
    // Extract path from provenance URI
    // Provenance format varies: "file://...", "network://...", or just a path
    let basePath: string;
    if (baseProvenance.includes('://')) {
      // URI format - extract path after protocol
      const url = new URL(baseProvenance);
      basePath = url.pathname;
    } else {
      // Plain path
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
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    return resolved.join('/');
  }

  /**
   * Check if an asset file exists via HEAD request.
   */
  async validateAssetPath(assetPath: string): Promise<boolean> {
    const { isMediaFile } = await import('@/lib/util/fileTypes');
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
    _prev: Record<ProvenanceURI, XmlFileInfo> = {}
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
    const url = params.toString()
      ? `${this.listEndpoint}?${params.toString()}`
      : this.listEndpoint;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to list files');
    }
    return json.tree as UriNode;
  }

  async read(path: string): Promise<ReadResult> {
    const lofsPath = this.toLofsPath(path as OlxRelativePath);
    const res = await fetch(
      `${this.readEndpoint}?path=${encodeURIComponent(lofsPath)}`,
    );
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to read');
    }
    return {
      content: json.content as string,
      metadata: json.metadata,
    };
  }

  async write(path: string, content: string, options: WriteOptions = {}): Promise<void> {
    const lofsPath = this.toLofsPath(path as OlxRelativePath);
    const { previousMetadata, force = false } = options;
    const res = await fetch(this.readEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: lofsPath, content, previousMetadata, force }),
    });
    const json = await res.json();
    if (!json.ok) {
      if (json.conflict) {
        throw new VersionConflictError(json.error, json.metadata);
      }
      throw new Error(json.error ?? 'Failed to write');
    }
  }

  async update(path: string, content: string): Promise<void> {
    await this.write(path, content);
  }

  async delete(path: string): Promise<void> {
    const lofsPath = this.toLofsPath(path as OlxRelativePath);
    const res = await fetch(
      `${this.readEndpoint}?path=${encodeURIComponent(lofsPath)}`,
      { method: 'DELETE' }
    );
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to delete');
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldLofsPath = this.toLofsPath(oldPath as OlxRelativePath);
    const newLofsPath = this.toLofsPath(newPath as OlxRelativePath);
    const res = await fetch(this.readEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: oldLofsPath, newPath: newLofsPath }),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to rename');
    }
  }

  /**
   * Find files matching a glob pattern.
   * Returns results as OlxRelativePath (relative to the provider's namespace).
   */
  async glob(pattern: string, basePath?: string): Promise<string[]> {
    const params = new URLSearchParams({ pattern });
    if (basePath) {
      const lofsBasePath = this.toLofsPath(basePath as OlxRelativePath);
      params.set('path', lofsBasePath);
    } else {
      // If no basePath, search from namespace root
      params.set('path', this.namespace as LofsPath);
    }

    const res = await fetch(`${this.listEndpoint}?${params.toString()}`);
    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to glob');
    }

    // Convert LofsPath results back to OlxRelativePath
    return (json.files as LofsPath[]).map(lofsPath => this.fromLofsPath(lofsPath));
  }

  /**
   * Search file contents for a pattern.
   * Returns results with paths as OlxRelativePath (relative to the provider's namespace).
   */
  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const params = new URLSearchParams({ pattern });
    if (options.basePath) {
      const lofsBasePath = this.toLofsPath(options.basePath as OlxRelativePath);
      params.set('path', lofsBasePath);
    } else {
      // If no basePath, search from namespace root
      params.set('path', this.namespace as LofsPath);
    }
    if (options.include) params.set('include', options.include);
    if (options.limit) params.set('limit', String(options.limit));

    const res = await fetch(`${this.grepEndpoint}?${params.toString()}`);
    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to grep');
    }

    // Convert LofsPath results back to OlxRelativePath
    return (json.matches as Array<GrepMatch & { path: LofsPath }>).map(match => ({
      ...match,
      path: this.fromLofsPath(match.path as LofsPath),
    }));
  }
}
