// packages/shared/lib/lofs/providers/mountRouter.ts
//
// Mount router — a virtual content filesystem unioning several sources.
//
// Each source (typically a git checkout managed by dev-ops — see
// docs/content-in-git.md) is mounted at a path prefix:
//
//   psychology/lesson1.olx   → psych-repo checkout: lesson1.olx
//   writing/journal.olx      → writing-repo checkout: journal.olx
//   demos/foo.olx            → fallback source (./content): demos/foo.olx
//
// Child providers get mountPoint "content/<mount>", so provenance refs look
// like file:content/psychology://lesson1.olx — a form the address grammar
// and contentPaths machinery already anticipate. The fallback keeps mount
// "content", so unrouted paths produce exactly today's refs.
//
// Crucially, the ROUTER's path space ("psychology/lesson1.olx") is identical
// to the old single-directory layout where each source was a subdirectory of
// ./content. Client paths, asset URLs, namespaces (each repo's manifest.yaml
// or directory convention), and student state keys are all unchanged by
// moving a source into its own repo.

import type { LofsRef, OlxRelativePath, SafeRelativePath } from '../../types';
import {
  type StorageProvider,
  type NamespaceResolution,
  type XmlFileInfo,
  type XmlScanResult,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type WriteOptions,
  type GrepOptions,
  type GrepMatch,
} from '../../types/storage';

export interface MountEntry {
  /** Path prefix this source is mounted at (e.g. "psychology"). */
  mount: string;
  /** Provider rooted at the source, with mountPoint "content/<mount>". */
  provider: StorageProvider;
  /** Filesystem directory (for asset copying; absent for non-fs providers). */
  baseDir?: string;
}

export class MountRouterProvider implements StorageProvider {
  readonly mounts: MountEntry[];
  readonly fallback: StorageProvider;

  constructor(mounts: MountEntry[], fallback: StorageProvider) {
    const seen = new Set<string>();
    for (const { mount } of mounts) {
      if (!mount || mount.includes('/')) {
        throw new Error(`Mount names must be single path segments: "${mount}"`);
      }
      if (seen.has(mount)) {
        throw new Error(`Duplicate mount: "${mount}"`);
      }
      seen.add(mount);
    }
    this.mounts = mounts;
    this.fallback = fallback;
  }

  /** Route a router-visible path to its source provider and source-relative path. */
  private route(p: string): { provider: StorageProvider; rest: string } {
    const sep = p.indexOf('/');
    const head = sep < 0 ? p : p.slice(0, sep);
    const entry = this.mounts.find(m => m.mount === head);
    if (entry) {
      return { provider: entry.provider, rest: sep < 0 ? '' : p.slice(sep + 1) };
    }
    return { provider: this.fallback, rest: p };
  }

  async read(p: OlxRelativePath): Promise<ReadResult> {
    const { provider, rest } = this.route(p);
    return provider.read(rest as OlxRelativePath);
  }

  async write(p: OlxRelativePath, content: string, options?: WriteOptions): Promise<void> {
    const { provider, rest } = this.route(p);
    return provider.write(rest as OlxRelativePath, content, options);
  }

  async update(p: OlxRelativePath, content: string): Promise<void> {
    const { provider, rest } = this.route(p);
    return provider.update(rest as OlxRelativePath, content);
  }

  async delete(p: OlxRelativePath): Promise<void> {
    const { provider, rest } = this.route(p);
    return provider.delete(rest as OlxRelativePath);
  }

  async rename(oldPath: OlxRelativePath, newPath: OlxRelativePath): Promise<void> {
    const from = this.route(oldPath);
    const to = this.route(newPath);
    if (from.provider !== to.provider) {
      // Cross-source rename = move between repos. Not a rename — needs
      // copy+delete with history implications. Fail loudly.
      throw new Error(
        `Cannot rename across content sources: "${oldPath}" → "${newPath}"`
      );
    }
    return from.provider.rename(from.rest as OlxRelativePath, to.rest as OlxRelativePath);
  }

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    // basePath routes when it enters a mount; otherwise search everywhere.
    if (basePath) {
      const { provider, rest } = this.route(basePath);
      const entry = this.mounts.find(m => m.provider === provider);
      const results = await provider.glob(pattern, (rest || undefined) as OlxRelativePath | undefined);
      return entry ? results.map(r => `${entry.mount}/${r}` as OlxRelativePath) : results;
    }
    const all: OlxRelativePath[] = [];
    for (const entry of this.mounts) {
      const results = await entry.provider.glob(pattern);
      all.push(...results.map(r => `${entry.mount}/${r}` as OlxRelativePath));
    }
    all.push(...await this.fallback.glob(pattern));
    return all;
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    if (options.basePath) {
      const { provider, rest } = this.route(options.basePath);
      const entry = this.mounts.find(m => m.provider === provider);
      const matches = await provider.grep(pattern, { ...options, basePath: (rest || undefined) as OlxRelativePath | undefined });
      return entry ? matches.map(m => ({ ...m, path: `${entry.mount}/${m.path}` as OlxRelativePath })) : matches;
    }
    const all: GrepMatch[] = [];
    for (const entry of this.mounts) {
      const matches = await entry.provider.grep(pattern, options);
      all.push(...matches.map(m => ({ ...m, path: `${entry.mount}/${m.path}` as OlxRelativePath })));
    }
    all.push(...await this.fallback.grep(pattern, options));
    return all;
  }

  // Union scan. Each child filters `previous` to its own mount (see
  // FileStorageProvider.loadXmlFilesWithStats), so passing the full previous
  // snapshot to every child is safe — the same contract StackedStorageProvider
  // relies on. Paths are disjoint by construction (distinct mounts), so a
  // plain merge needs no shadowing logic.
  async loadXmlFilesWithStats(previous: Record<LofsRef, XmlFileInfo> = {}): Promise<XmlScanResult> {
    const merged: XmlScanResult = { added: {}, changed: {}, unchanged: {}, deleted: {} };
    for (const provider of [...this.mounts.map(m => m.provider), this.fallback]) {
      const scan = await provider.loadXmlFilesWithStats(previous);
      Object.assign(merged.added, scan.added);
      Object.assign(merged.changed, scan.changed);
      Object.assign(merged.unchanged, scan.unchanged);
      Object.assign(merged.deleted, scan.deleted);
    }
    return merged;
  }

  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    // Fallback tree is the base; each mount appears as a top-level directory.
    const root = await this.fallback.listFiles(selection);
    const children = [...(root.children ?? [])];
    for (const entry of this.mounts) {
      const tree = await entry.provider.listFiles(selection);
      children.push({
        uri: entry.mount,
        children: (tree.children ?? []).map(c => prefixUris(c, entry.mount)),
      });
    }
    children.sort((a, b) => a.uri.localeCompare(b.uri));
    return { uri: root.uri, children };
  }

  // Provenance-keyed operations route by mount-mismatch fallthrough —
  // the same pattern as StackedStorageProvider.
  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    for (const entry of this.mounts) {
      try {
        const resolved = entry.provider.resolveRelativePath(baseProvenance, relativePath);
        return `${entry.mount}/${resolved}` as SafeRelativePath;
      } catch { /* not this mount */ }
    }
    return this.fallback.resolveRelativePath(baseProvenance, relativePath);
  }

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    const { provider, rest } = this.route(safePath);
    return provider.toLofsRef(rest as SafeRelativePath);
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    for (const entry of this.mounts) {
      try {
        const rest = entry.provider.toRelativePath(uri);
        return `${entry.mount}/${rest}` as OlxRelativePath;
      } catch { /* not this mount */ }
    }
    return this.fallback.toRelativePath(uri);
  }

  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    // Route to the child that OWNS the ref, then let its resolution result
    // (including a real NamespaceResolutionError) propagate. Ownership is
    // tested separately via toRelativePath — which every provider defines
    // to throw on foreign refs — so this works for any child provider
    // (file:content/<mount> refs, git repo-URL refs, ...).
    for (const entry of this.mounts) {
      try {
        entry.provider.toRelativePath(ref);
      } catch {
        continue; // not this child's ref
      }
      return entry.provider.namespaceFor(ref);
    }
    return this.fallback.namespaceFor(ref);
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    const { provider, rest } = this.route(assetPath);
    return provider.validateAssetPath(rest as OlxRelativePath);
  }
}

/** Recursively prefix a UriNode's uris with a mount name. */
function prefixUris(node: UriNode, mount: string): UriNode {
  return {
    ...node,
    uri: `${mount}/${node.uri}`,
    children: node.children?.map(c => prefixUris(c, mount)),
  };
}
