// packages/shared/lib/lofs/sourceSet.ts
//
// Union operations over a set of content-source providers. SERVER-SIDE
// (sits next to contentSources.ts, which assembles the set from config).
//
// Each configured source's refs are origin-distinct, so combining them is a
// merge, not a router: there is no mount-prefix shadowing between sources — a
// file only shadows another with the SAME ref. Priority is list order:
// providers earlier in the array win (first-provider-wins reads; earlier
// results shadow later ones in scans and listings).
//
// The union is an explicit operation at the sync/tool layer — a set of
// StorageProviders combined per call — not a StorageProvider that pretends a
// set of sources is one provider.
//
import type { LofsRef, OlxRelativePath } from '../types';
import {
  NamespaceResolutionError,
  type StorageProvider,
  type NamespaceResolution,
  type XmlFileInfo,
  type XmlScanResult,
  type UriNode,
  type ReadResult,
  type GrepOptions,
  type GrepMatch,
} from '../types/storage';

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
    delete merged.added[id as LofsRef];
    delete merged.changed[id as LofsRef];
    delete merged.unchanged[id as LofsRef];
    delete merged.deleted[id as LofsRef];
  }

  // Now add higher priority results
  Object.assign(merged.added, higher.added);
  Object.assign(merged.changed, higher.changed);
  Object.assign(merged.unchanged, higher.unchanged);
  Object.assign(merged.deleted, higher.deleted);

  return merged;
}

/** Fold a list of per-provider results (highest priority first) into one,
 *  merging low-to-high so earlier providers shadow later ones. */
function foldByPriority<T>(results: T[], merge: (higher: T, lower: T) => T, empty: T): T {
  if (results.length === 0) return empty;
  let merged = results[results.length - 1];
  for (let i = results.length - 2; i >= 0; i--) {
    merged = merge(results[i], merged);
  }
  return merged;
}

/**
 * Scan every source and merge the results. Each provider receives the FULL
 * previous snapshot (which contains other sources' refs too); a provider must
 * diff only against its own refs — otherwise it reports the other sources'
 * files as deleted and the merge destroys the index.
 *
 * A source that can't scan (down remote, unsupported) drops out of the merged
 * result — logged, because otherwise its content silently vanishes from the
 * union with no trace. (TODO: structured per-source health surfacing.)
 */
export async function scanSources(
  sources: StorageProvider[],
  previous: Record<LofsRef, XmlFileInfo> = {},
): Promise<XmlScanResult> {
  const results: XmlScanResult[] = [];
  for (const provider of sources) {
    try {
      results.push(await provider.loadXmlFilesWithStats(previous));
    } catch (err) {
      console.error(`[scanSources] source scan failed, dropping its content: ${(err as Error).message}`);
    }
  }
  return foldByPriority(results, mergeXmlScanResults, { added: {}, changed: {}, unchanged: {}, deleted: {} });
}

/**
 * Read from the first source that has the file. A not-found (ENOENT / "not
 * found") falls through to the next source; any other read failure propagates —
 * a real error (permissions, corruption, a down remote) is not the same as
 * absence and must not be masked by trying the next source.
 */
export async function readFirst(sources: StorageProvider[], path: OlxRelativePath): Promise<ReadResult> {
  for (const provider of sources) {
    try {
      return await provider.read(path);
    } catch (err: any) {
      const notFound = err?.code === 'ENOENT' || String(err?.message).includes('not found');
      if (!notFound) throw err;
    }
  }
  throw new Error(`File not found in any source: ${path}`);
}

/** Glob across every source: union of matches, deduplicated by path, in
 *  priority order. A source that can't glob drops out. */
export async function globAll(
  sources: StorageProvider[],
  pattern: string,
  basePath?: OlxRelativePath,
): Promise<OlxRelativePath[]> {
  const seen = new Set<string>();
  const results: OlxRelativePath[] = [];
  for (const provider of sources) {
    try {
      for (const match of await provider.glob(pattern, basePath)) {
        if (!seen.has(match)) {
          seen.add(match);
          results.push(match);
        }
      }
    } catch {
      // Source doesn't support glob or failed — skip it.
    }
  }
  return results;
}

/** Grep across every source: union of matches, deduplicated by path:line,
 *  sorted by path then line. Each source limited itself, but the union can
 *  exceed the cap — re-apply options.limit to the merged result. */
export async function grepAll(
  sources: StorageProvider[],
  pattern: string,
  options: GrepOptions = {},
): Promise<GrepMatch[]> {
  const seen = new Set<string>();
  const results: GrepMatch[] = [];
  for (const provider of sources) {
    try {
      for (const match of await provider.grep(pattern, options)) {
        const key = `${match.path}:${match.line}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(match);
        }
      }
    } catch {
      // Source doesn't support grep or failed — skip it.
    }
  }

  results.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.line - b.line;
  });

  return options.limit !== undefined ? results.slice(0, options.limit) : results;
}

/** Full file tree across every source, merged (higher priority shadows lower).
 *  A source that can't list drops out. */
export async function listFilesAll(sources: StorageProvider[]): Promise<UriNode> {
  const results: UriNode[] = [];
  for (const provider of sources) {
    try {
      results.push(await provider.listFiles());
    } catch {
      // Source doesn't support listFiles or failed — skip it.
    }
  }
  return foldByPriority(results, mergeUriTrees, { uri: '', children: [] });
}

/**
 * Resolve a ref's namespace via the source that owns it. A non-owning source
 * throws a plain Error (mount mismatch / wrong scheme), so we fall through to
 * the next — same routing as readFirst. But a NamespaceResolutionError means
 * the OWNING source found the ref and still couldn't resolve a namespace (e.g.
 * an OLX file at the content root): that's the authoritative, author-facing
 * answer, so propagate it instead of masking it with the next source's
 * mount-mismatch error.
 */
export async function namespaceForAcross(
  sources: StorageProvider[],
  ref: LofsRef,
): Promise<NamespaceResolution> {
  let lastError: Error | null = null;
  for (const provider of sources) {
    try {
      return await provider.namespaceFor(ref);
    } catch (err) {
      if (err instanceof NamespaceResolutionError) throw err;
      lastError = err as Error;
    }
  }
  throw lastError || new Error(`Cannot resolve namespace in any source for: ${ref}`);
}
