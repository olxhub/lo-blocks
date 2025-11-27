// src/lib/storage/providers/memory.ts
//
// In-memory storage provider - virtual filesystem for testing and inline content.
//
// Provides a read-only storage provider backed by an in-memory record of files.
// Useful for:
// - Rendering inline OLX content without a real filesystem
// - Testing components that depend on StorageProvider
// - Virtual filesystems for documentation examples
// - Multi-file content where files reference each other via src=""
//
import type { ProvenanceURI } from '../../types';
import type {
  StorageProvider,
  XmlFileInfo,
  XmlScanResult,
  FileSelection,
  UriNode,
} from '../types';

export class InMemoryStorageProvider implements StorageProvider {
  private files: Record<string, string>;
  private basePath: string;

  constructor(files: Record<string, string>, basePath: string = '') {
    this.files = files;
    this.basePath = basePath;
  }

  async read(path: string): Promise<string> {
    // Normalize path - remove leading ./ or /
    const normalized = path.replace(/^\.?\//, '');

    if (this.files[normalized] !== undefined) {
      return this.files[normalized];
    }

    // Try with basePath prefix
    const withBase = this.basePath ? `${this.basePath}/${normalized}` : normalized;
    if (this.files[withBase] !== undefined) {
      return this.files[withBase];
    }

    throw new Error(`File not found: ${path}`);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = path.replace(/^\.?\//, '');
    return this.files[normalized] !== undefined;
  }

  async write(_path: string, _content: string): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async update(_path: string, _content: string): Promise<void> {
    throw new Error('InMemoryStorageProvider is read-only');
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    // Build a simple flat list of files
    const children: UriNode[] = Object.keys(this.files).map(uri => ({ uri }));
    return { uri: '', children };
  }

  async loadXmlFilesWithStats(
    _previous: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error('loadXmlFilesWithStats not implemented for InMemoryStorageProvider');
  }

  resolveRelativePath(_baseProvenance: ProvenanceURI, relativePath: string): string {
    // For in-memory provider, just return the relative path as-is
    // since all files are in a flat namespace
    return relativePath.replace(/^\.?\//, '');
  }

  async validateImagePath(imagePath: string): Promise<boolean> {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    if (!imageExts.some(ext => imagePath.toLowerCase().endsWith(ext))) {
      return false;
    }
    return this.exists(imagePath);
  }
}
