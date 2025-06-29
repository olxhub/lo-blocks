// src/lib/storage/network.ts
// src/lib/storage/network.ts
import type {
  StorageProvider,
  XmlFileInfo,
  XmlScanResult,
  FileSelection,
  UriNode,
} from './index';
import type { ProvenanceURI } from '../types';

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
}
