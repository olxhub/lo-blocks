// packages/shared/lib/lofs/providers/postgres.ts
//
// Postgres storage provider - database-backed content (stub).
//
// Planned implementation for storing content in PostgreSQL databases,
// enabling workflows like:
// - Multi-tenant content management
// - Integration with existing LMS databases
// - Content versioning and audit trails
//
import type { LofsRef, OlxRelativePath, SafeRelativePath, ContentNamespace } from '../../types';
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
} from '../../types/storage';

export class PostgresStorageProvider implements StorageProvider {
  constructor(public options: Record<string, any>) {}

  async loadXmlFilesWithStats(
    _prev: Record<LofsRef, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    throw new Error('postgres storage not implemented');
  }

  async read(_path: OlxRelativePath): Promise<ReadResult> {
    throw new Error('postgres storage not implemented');
  }

  async write(_path: OlxRelativePath, _content: string, _options?: WriteOptions): Promise<void> {
    throw new Error('postgres storage not implemented');
  }

  async update(_path: OlxRelativePath, _content: string): Promise<void> {
    throw new Error('postgres storage not implemented');
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    throw new Error('postgres storage not implemented');
  }

  resolveRelativePath(_baseProvenance: LofsRef, _relativePath: string): SafeRelativePath {
    throw new Error('postgres storage not implemented');
  }

  toLofsRef(_path: SafeRelativePath): LofsRef {
    throw new Error('postgres storage not implemented');
  }

  toRelativePath(_uri: LofsRef): OlxRelativePath {
    throw new Error('postgres storage not implemented');
  }

  async validateAssetPath(_assetPath: OlxRelativePath): Promise<boolean> {
    throw new Error('postgres storage not implemented');
  }

  async glob(_pattern: string, _basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    throw new Error('postgres storage not implemented');
  }

  async grep(_pattern: string, _options?: GrepOptions): Promise<GrepMatch[]> {
    throw new Error('postgres storage not implemented');
  }

  async delete(_path: OlxRelativePath): Promise<void> {
    throw new Error('postgres storage not implemented');
  }

  async rename(_oldPath: OlxRelativePath, _newPath: OlxRelativePath): Promise<void> {
    throw new Error('postgres storage not implemented');
  }

  async namespaceFor(_ref: LofsRef): Promise<ContentNamespace> {
    throw new Error('postgres storage not implemented');
  }
}
