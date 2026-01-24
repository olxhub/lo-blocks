// src/lib/lofs/providers/git.ts
//
// Git storage provider - version-controlled content access (stub).
//
// Planned implementation for accessing content directly from git repositories,
// enabling workflows like:
// - Reading content from specific commits or branches
// - Tracking content history and changes
// - Integration with git-based authoring workflows
//
import type { ProvenanceURI } from '../../types';
import type {
  StorageProvider,
  XmlFileInfo,
  XmlScanResult,
  FileSelection,
  UriNode,
  ReadResult,
  WriteOptions,
  GrepOptions,
  GrepMatch,
} from '../types';

export class GitStorageProvider implements StorageProvider {
  constructor(public repoPath: string) {}

  async loadXmlFilesWithStats(
    _prev: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error('git storage not implemented');
  }

  async read(_path: string): Promise<ReadResult> {
    throw new Error('git storage not implemented');
  }

  async write(_path: string, _content: string, _options?: WriteOptions): Promise<void> {
    throw new Error('git storage not implemented');
  }

  async update(_path: string, _content: string): Promise<void> {
    throw new Error('git storage not implemented');
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    throw new Error('git storage not implemented');
  }

  resolveRelativePath(_baseProvenance: ProvenanceURI, _relativePath: string): string {
    throw new Error('git storage not implemented');
  }

  async validateImagePath(_imagePath: string): Promise<boolean> {
    throw new Error('git storage not implemented');
  }

  async glob(_pattern: string, _basePath?: string): Promise<string[]> {
    throw new Error('git storage not implemented');
  }

  async grep(_pattern: string, _options?: GrepOptions): Promise<GrepMatch[]> {
    throw new Error('git storage not implemented');
  }

  async delete(_path: string): Promise<void> {
    throw new Error('git storage not implemented');
  }

  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error('git storage not implemented');
  }
}
