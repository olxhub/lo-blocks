// src/lib/storage/providers/network.ts
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
import type { ProvenanceURI } from '../../types';
import type {
  StorageProvider,
  XmlFileInfo,
  XmlScanResult,
  FileSelection,
  UriNode,
} from '../types';

export interface NetworkProviderOptions {
  readEndpoint?: string;
  listEndpoint?: string;
}

export class NetworkStorageProvider implements StorageProvider {
  readEndpoint: string;
  listEndpoint: string;

  constructor(options: NetworkProviderOptions = {}) {
    this.readEndpoint = (options.readEndpoint ?? '/api/file').replace(/\/$/, '');
    this.listEndpoint = (options.listEndpoint ?? '/api/files').replace(/\/$/, '');
  }

  resolveRelativePath(_baseProvenance: ProvenanceURI, _relativePath: string): string {
    throw new Error('Method not implemented.');
  }

  validateImagePath(_imagePath: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  async loadXmlFilesWithStats(
    _prev: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error('network storage scan not implemented');
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

  async read(path: string): Promise<string> {
    const res = await fetch(
      `${this.readEndpoint}?path=${encodeURIComponent(path)}`,
    );
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to read');
    }
    return json.content as string;
  }

  async write(path: string, content: string): Promise<void> {
    const res = await fetch(this.readEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to write');
    }
  }

  async update(path: string, content: string): Promise<void> {
    await this.write(path, content);
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(
      `${this.readEndpoint}?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' }
    );
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to delete');
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const res = await fetch(this.readEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: oldPath, newPath }),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Failed to rename');
    }
  }
}
