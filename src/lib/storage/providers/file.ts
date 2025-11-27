// src/lib/storage/providers/file.ts
//
// File storage provider - local filesystem access for Learning Observer.
//
// Primary storage implementation for development and local deployments.
// Reads content from a base directory (default: ./content) with security
// sandboxing to prevent path traversal attacks.
//
import path from 'path';
import pegExts from '../../../generated/pegExtensions.json' assert { type: 'json' };
import type { ProvenanceURI } from '../../types';
import type {
  StorageProvider,
  XmlFileInfo,
  XmlScanResult,
  FileSelection,
  UriNode,
} from '../types';
import { fileTypes } from '../fileTypes';

/**
 * Resolve a relative path within a base directory, with security checks.
 * Prevents path traversal attacks and symlink-based escapes.
 * Server-only - uses Node.js fs module.
 */
async function resolveSafePath(baseDir: string, relPath: string) {
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    throw new Error('Invalid path');
  }
  const full = path.resolve(baseDir, relPath);
  const relative = path.relative(baseDir, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path');
  }
  const fs = await import('fs/promises');
  const stats = await fs.lstat(full).catch(() => null);
  if (stats && stats.isSymbolicLink()) {
    throw new Error('Symlinks not allowed');
  }
  return full;
}

/**
 * Build a tree of XML/OLX files from a content directory.
 * Server-only - uses Node.js fs module.
 */
async function listFileTree(
  selection: FileSelection = {},
  baseDir = './content'
): Promise<UriNode> {
  const fs = await import('fs/promises');

  const walk = async (rel = ''): Promise<UriNode> => {
    const dirPath = path.join(baseDir, rel);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: UriNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        children.push(await walk(relPath));
      } else if (entry.isFile()) {
        const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)];
        if (allowed.some(ext => entry.name.endsWith(ext))) {
          children.push({ uri: relPath });
        }
      }
    }
    return {
      uri: rel ?? '',
      children,
    };
  };

  // currently selection is unused but reserved for future features
  void selection;
  return walk('');
}

export class FileStorageProvider implements StorageProvider {
  baseDir: string;

  constructor(baseDir = './content') {
    this.baseDir = path.resolve(baseDir);
  }

  async loadXmlFilesWithStats(previous: Record<ProvenanceURI, XmlFileInfo> = {}): Promise<XmlScanResult> {
    const fs = await import('fs/promises');

    function isContentFile(entry: any, fullPath: string) {
      const fileName = entry.name || fullPath.split('/').pop();
      // TODO: Do this in fileTypes.ts
      const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)];
      return (
        entry.isFile() &&
        allowed.some(ext => fullPath.endsWith(ext)) &&
        !fileName.includes('~') &&
        !fileName.includes('#') &&
        !fileName.startsWith('.')
      );
    }

    function fileChanged(statA: any, statB: any) {
      if (!statA || !statB) return true;
      return (
        statA.size !== statB.size ||
        statA.mtimeMs !== statB.mtimeMs ||
        statA.ctimeMs !== statB.ctimeMs
      );
    }

    const found: Record<ProvenanceURI, boolean> = {};
    const added: Record<ProvenanceURI, XmlFileInfo> = {};
    const changed: Record<ProvenanceURI, XmlFileInfo> = {};
    const unchanged: Record<ProvenanceURI, XmlFileInfo> = {};

    const walk = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (isContentFile(entry, fullPath)) {
          const id = `file://${fullPath}` as ProvenanceURI;
          const stat = await fs.stat(fullPath);
          const ext = path.extname(fullPath).slice(1);
          const type = (fileTypes as any)[ext] ?? ext;
          found[id] = true;
          const prev = previous[id];
          if (prev) {
            if (fileChanged(prev._metadata.stat, stat)) {
              const content = await fs.readFile(fullPath, 'utf-8');
              changed[id] = { id, type, _metadata: { stat }, content };
            } else {
              unchanged[id] = prev;
            }
          } else {
            const content = await fs.readFile(fullPath, 'utf-8');
            added[id] = { id, type, _metadata: { stat }, content };
          }
        }
      }
    };

    await walk(this.baseDir);

    const deleted: Record<ProvenanceURI, XmlFileInfo> = Object.keys(previous)
      .filter(id => !(id in found))
      .reduce((out: Record<ProvenanceURI, XmlFileInfo>, id: ProvenanceURI) => {
        out[id] = previous[id];
        return out;
      }, {});

    return { added, changed, unchanged, deleted };
  }

  async read(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const full = await resolveSafePath(this.baseDir, filePath);
    return fs.readFile(full, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const full = await resolveSafePath(this.baseDir, filePath);
    await fs.writeFile(full, content, 'utf-8');
  }

  async update(path: string, content: string): Promise<void> {
    await this.write(path, content);
  }

  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    return listFileTree(selection, this.baseDir);
  }

  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): string {
    // Extract the file path from provenance URI relative to this provider's baseDir
    // e.g., "file:///home/user/projects/lo-blocks/content/sba/file.xml" -> "sba/file.xml"
    if (!baseProvenance.startsWith('file://')) {
      throw new Error(`Unsupported provenance format: ${baseProvenance}`);
    }

    const filePath = baseProvenance.slice(7); // Remove "file://"
    const relativeFilePath = path.relative(this.baseDir, filePath);

    if (relativeFilePath.startsWith('..')) {
      throw new Error(`Provenance file outside base directory: ${baseProvenance}`);
    }

    const baseDir = path.dirname(relativeFilePath);
    const resolved = path.join(baseDir, relativePath);
    return path.normalize(resolved);
  }

  async validateImagePath(imagePath: string): Promise<boolean> {
    try {
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
      if (!imageExts.some(ext => imagePath.toLowerCase().endsWith(ext))) {
        return false;
      }

      const fullPath = await resolveSafePath(this.baseDir, imagePath);
      const fs = await import('fs/promises');
      const stat = await fs.stat(fullPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}
