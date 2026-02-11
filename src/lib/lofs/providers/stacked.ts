// src/lib/lofs/providers/stacked.ts
//
// Stacked storage provider - layered content access with fallback chain.
//
// Enables content layering where higher-priority providers override lower ones:
// - User edits (highest priority)
// - Course-specific content
// - Institution content
// - Platform defaults (lowest priority)
//
// For read operations, tries each provider in order until content is found.
// Write operations go to the first provider that supports writes.
//
// MERGE SEMANTICS:
// - read(): First provider with the file wins (highest priority)
// - listFiles(): Union of all providers, higher priority shadows lower
// - loadXmlFilesWithStats(): Merged scan, higher priority files shadow lower
// - validateAssetPath(): True if exists in any provider
//
import type { ProvenanceURI, OlxRelativePath, SafeRelativePath } from '../../types';
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
} from '../types';

/**
 * Merge two UriNode trees, with nodes from `higher` taking precedence.
 * Files in `higher` shadow files with the same URI in `lower`.
 */
function mergeUriTrees(higher: UriNode, lower: UriNode): UriNode {
  // If no children, just return higher (it's a file, not a directory)
  if (!higher.children && !lower.children) {
    return higher;
  }

  // Build a map of children from lower priority
  const childMap = new Map<string, UriNode>();
  for (const child of lower.children ?? []) {
    childMap.set(child.uri, child);
  }

  // Merge in children from higher priority (overwriting lower)
  for (const child of higher.children ?? []) {
    const existing = childMap.get(child.uri);
    if (existing && (child.children || existing.children)) {
      // Both are directories - merge recursively
      childMap.set(child.uri, mergeUriTrees(child, existing));
    } else {
      // Higher priority wins
      childMap.set(child.uri, child);
    }
  }

  return {
    uri: higher.uri,
    children: Array.from(childMap.values()).sort((a, b) => a.uri.localeCompare(b.uri)),
  };
}

/**
 * Merge XmlScanResults from multiple providers.
 * Higher-priority providers' files shadow lower-priority ones.
 */
function mergeXmlScanResults(higher: XmlScanResult, lower: XmlScanResult): XmlScanResult {
  // Start with lower priority results
  const merged: XmlScanResult = {
    added: { ...lower.added },
    changed: { ...lower.changed },
    unchanged: { ...lower.unchanged },
    deleted: { ...lower.deleted },
  };

  // Higher priority results override lower
  // If a file exists in higher, remove it from lower's categories first
  const higherIds = [
    ...Object.keys(higher.added),
    ...Object.keys(higher.changed),
    ...Object.keys(higher.unchanged),
    ...Object.keys(higher.deleted),
  ];

  for (const id of higherIds) {
    delete merged.added[id as ProvenanceURI];
    delete merged.changed[id as ProvenanceURI];
    delete merged.unchanged[id as ProvenanceURI];
    delete merged.deleted[id as ProvenanceURI];
  }

  // Now add higher priority results
  Object.assign(merged.added, higher.added);
  Object.assign(merged.changed, higher.changed);
  Object.assign(merged.unchanged, higher.unchanged);
  Object.assign(merged.deleted, higher.deleted);

  return merged;
}

export class StackedStorageProvider implements StorageProvider {
  providers: StorageProvider[];

  constructor(providers: StorageProvider[]) {
    if (providers.length === 0) {
      throw new Error('StackedStorageProvider requires at least one provider');
    }
    this.providers = providers;
  }

  // Read from the first provider that has the file
  async read(filePath: OlxRelativePath): Promise<ReadResult> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        return await provider.read(filePath);
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw lastError || new Error(`File not found in any provider: ${filePath}`);
  }

  // Write to the first provider
  async write(filePath: OlxRelativePath, content: string, options?: WriteOptions): Promise<void> {
    return this.providers[0].write(filePath, content, options);
  }

  // Update in the first provider
  async update(filePath: OlxRelativePath, content: string): Promise<void> {
    return this.providers[0].update(filePath, content);
  }

  // List files merged from all providers (higher priority shadows lower)
  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    // Collect results from all providers (reverse order so we merge low-to-high)
    const results: UriNode[] = [];
    for (const provider of this.providers) {
      try {
        results.push(await provider.listFiles(selection));
      } catch {
        // Provider doesn't support listFiles or failed - skip it
      }
    }

    if (results.length === 0) {
      return { uri: '', children: [] };
    }

    // Merge from lowest priority to highest (first provider is highest)
    // So we reverse and fold from right to left
    let merged = results[results.length - 1];
    for (let i = results.length - 2; i >= 0; i--) {
      merged = mergeUriTrees(results[i], merged);
    }

    return merged;
  }

  // Scan merged from all providers (higher priority shadows lower)
  async loadXmlFilesWithStats(
    previous: Record<ProvenanceURI, XmlFileInfo> = {}
  ): Promise<XmlScanResult> {
    // Collect results from all providers
    const results: XmlScanResult[] = [];
    for (const provider of this.providers) {
      try {
        results.push(await provider.loadXmlFilesWithStats(previous));
      } catch {
        // Provider doesn't support scan or failed - skip it
      }
    }

    if (results.length === 0) {
      return { added: {}, changed: {}, unchanged: {}, deleted: {} };
    }

    // Merge from lowest priority to highest
    let merged = results[results.length - 1];
    for (let i = results.length - 2; i >= 0; i--) {
      merged = mergeXmlScanResults(results[i], merged);
    }

    return merged;
  }

  // Resolve path using the provider whose scheme matches the provenance.
  // Each provider checks its own scheme (memory://, file://, etc.) and throws
  // on mismatch, so the right provider handles the resolution.
  resolveRelativePath(baseProvenance: ProvenanceURI, relativePath: string): SafeRelativePath {
    for (const provider of this.providers) {
      try {
        return provider.resolveRelativePath(baseProvenance, relativePath);
      } catch {
        // Continue to next provider
      }
    }
    throw new Error(`Cannot resolve path in any provider: ${relativePath}`);
  }

  // Construct provenance from the provider that actually has the file.
  // Each provider checks existence and throws if it doesn't have the file,
  // so the first provider that has it claims the provenance — matching
  // read() priority order.
  toProvenanceURI(safePath: SafeRelativePath): ProvenanceURI {
    for (const provider of this.providers) {
      try {
        return provider.toProvenanceURI(safePath);
      } catch {
        // Continue to next provider
      }
    }
    throw new Error(`Cannot construct provenance in any provider for: ${safePath}`);
  }

  // Check if asset exists in any provider
  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    for (const provider of this.providers) {
      try {
        if (await provider.validateAssetPath(assetPath)) {
          return true;
        }
      } catch {
        // Continue
      }
    }
    return false;
  }

  // Glob merged from all providers (union, higher priority shadows lower)
  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    const seen = new Set<string>();
    const results: OlxRelativePath[] = [];

    // Collect from all providers, higher priority first
    for (const provider of this.providers) {
      try {
        const matches = await provider.glob(pattern, basePath);
        for (const match of matches) {
          if (!seen.has(match)) {
            seen.add(match);
            results.push(match);
          }
        }
      } catch {
        // Provider doesn't support glob or failed - skip it
      }
    }

    return results;
  }

  // Grep merged from all providers (union, deduplicated by path+line)
  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const seen = new Set<string>();
    const results: GrepMatch[] = [];

    // Collect from all providers, higher priority first
    for (const provider of this.providers) {
      try {
        const matches = await provider.grep(pattern, options);
        for (const match of matches) {
          const key = `${match.path}:${match.line}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(match);
          }
        }
      } catch {
        // Provider doesn't support grep or failed - skip it
      }
    }

    // Sort by path, then line number
    results.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.line - b.line;
    });

    return results;
  }

  // Delete from the first provider
  async delete(filePath: OlxRelativePath): Promise<void> {
    return this.providers[0].delete(filePath);
  }

  // Rename in the first provider
  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    return this.providers[0].rename(oldPath, newPath);
  }
}
