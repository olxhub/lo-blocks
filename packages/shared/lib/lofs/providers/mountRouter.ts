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
  private readonly mountMap: Map<string, MountEntry>;

  constructor(mounts: MountEntry[], fallback: StorageProvider) {
    this.mountMap = new Map();
    for (const entry of mounts) {
      if (!entry.mount || entry.mount.includes('/')) {
        throw new Error(`Mount names must be single path segments: "${entry.mount}"`);
      }
      if (this.mountMap.has(entry.mount)) {
        throw new Error(`Duplicate mount: "${entry.mount}"`);
      }
      this.mountMap.set(entry.mount, entry);
    }
    this.mounts = mounts;
    this.fallback = fallback;
  }

  /** Route a router-visible path to its source provider and source-relative path. */
  private route(p: string): { provider: StorageProvider; rest: string } {
    const sep = p.indexOf('/');
    const head = sep < 0 ? p : p.slice(0, sep);
    const entry = this.mountMap.get(head);
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
    // Drop fallback hits under a mount prefix — the mount shadows them.
    all.push(...(await this.fallback.glob(pattern)).filter(p => !this.pathHeadIsMount(String(p))));
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
    // Drop fallback hits under a mount prefix — the mount shadows them.
    all.push(...(await this.fallback.grep(pattern, options)).filter(m => !this.pathHeadIsMount(String(m.path))));
    return all;
  }

  // Union scan. Each child filters `previous` to its own mount (see
  // FileStorageProvider.loadXmlFilesWithStats), so passing the full previous
  // snapshot to every child is safe — the same contract StackedStorageProvider
  // relies on. Mounts are disjoint from each other by construction (distinct
  // mount names); the FALLBACK, however, can physically still contain a
  // "<mount>/..." subtree (mid-migration, or a stale copy). Reads shadow that
  // via route(), so the scan must too — otherwise the same router path is
  // indexed twice under different refs (file:content/<mount>://x and
  // file:content://<mount>/x), double-counting blocks. Drop fallback entries
  // that fall under a mount prefix.
  async loadXmlFilesWithStats(previous: Record<LofsRef, XmlFileInfo> = {}): Promise<XmlScanResult> {
    const merged: XmlScanResult = { added: {}, changed: {}, unchanged: {}, deleted: {} };
    const successfulMounts = new Set<string>();

    // Failure isolation: one source failing to scan (network blip, bad branch,
    // unreadable dir) must NOT blank the whole index. Skip the failed source
    // and keep going. Its previously-parsed content persists — a file in
    // `previous` that lands in no scan bucket is neither re-parsed nor removed
    // by applyFileChanges — and it re-syncs once the source recovers.
    //
    // The failure is logged, not returned: XmlScanResult has no error channel,
    // and the consumer that would surface "repo X is down" (a teacher/ops
    // dashboard) doesn't exist yet. Wire structured surfacing when it does.
    for (const entry of this.mounts) {
      let scan: XmlScanResult;
      try {
        scan = await entry.provider.loadXmlFilesWithStats(previous);
        successfulMounts.add(entry.mount);
      } catch (err) {
        console.error(`[content-sync] source "${entry.mount}" failed to scan; keeping last-known content:`, err);
        continue;
      }
      Object.assign(merged.added, scan.added);
      Object.assign(merged.changed, scan.changed);
      Object.assign(merged.unchanged, scan.unchanged);
      Object.assign(merged.deleted, scan.deleted);
    }

    let fb: XmlScanResult | null = null;
    try {
      fb = await this.fallback.loadXmlFilesWithStats(previous);
    } catch (err) {
      console.error('[content-sync] fallback source failed to scan; keeping last-known content:', err);
    }
    if (fb) {
      for (const bucket of ['added', 'changed', 'unchanged', 'deleted'] as const) {
        for (const [ref, info] of Object.entries(fb[bucket])) {
          if (!this.shadowedByMount(ref as LofsRef)) merged[bucket][ref as LofsRef] = info;
        }
      }
    }

    // Ownership reconciliation: previous refs parsed from the fallback whose
    // router path now falls under a successfully scanned mount must be retired.
    // Without this, the shadow filter suppresses the fallback scan's report of
    // these refs, they land in no scan bucket, and applyFileChanges keeps the
    // stale fallback-sourced blocks indefinitely. See docs/content-in-git.md.
    this.reconcileRetiredFallbackRefs(previous, successfulMounts, merged);

    return merged;
  }

  /**
   * Retire fallback refs whose router path now falls under a successfully
   * scanned mount. For each retired ref:
   *
   * 1. Inject into `deleted` so applyFileChanges removes its blocks.
   * 2. If the mounted replacement is in `unchanged`, promote it to `changed`
   *    so it's reparsed in the same sync cycle — otherwise the block vanishes
   *    (the old source is removed but the new one isn't reparsed).
   *
   * Mounts that failed to scan are skipped — "missing from scan" means
   * failure isolation, not ownership transfer.
   */
  private reconcileRetiredFallbackRefs(
    previous: Record<LofsRef, XmlFileInfo>,
    successfulMounts: Set<string>,
    merged: XmlScanResult,
  ): void {
    for (const [refStr, info] of Object.entries(previous)) {
      const ref = refStr as LofsRef;
      // Is this a fallback ref?
      let rel: string;
      try { rel = String(this.fallback.toRelativePath(ref)); }
      catch { continue; }
      // Does its router path fall under a successfully scanned mount?
      const sep = rel.indexOf('/');
      const head = sep < 0 ? rel : rel.slice(0, sep);
      if (!successfulMounts.has(head)) continue;
      // Already accounted for in a scan bucket? (Defensive — the shadow filter
      // should suppress these, but don't inject a duplicate deletion.)
      if (ref in merged.added || ref in merged.changed ||
          ref in merged.unchanged || ref in merged.deleted) continue;
      // Retire: tell applyFileChanges to remove the old fallback-sourced blocks.
      merged.deleted[ref] = info;
      // Promote the mounted replacement from unchanged → changed so it's
      // reparsed in the same cycle. If it's already in added or changed, the
      // reparse happens anyway — only unchanged needs promotion.
      const rest = sep < 0 ? '' : rel.slice(sep + 1);
      if (!rest) continue;  // no subpath → no corresponding mount file
      const mountEntry = this.mountMap.get(head);
      if (!mountEntry) continue;
      try {
        const mountRef = mountEntry.provider.toLofsRef(rest as SafeRelativePath);
        const mountRefStr = String(mountRef) as LofsRef;
        if (mountRefStr in merged.unchanged) {
          merged.changed[mountRefStr] = merged.unchanged[mountRefStr];
          delete merged.unchanged[mountRefStr];
        }
      } catch { /* mount provider can't construct this ref — skip promotion */ }
    }
  }

  /** Does a fallback ref's router path fall under a mount prefix? */
  private shadowedByMount(ref: LofsRef): boolean {
    let rel: string;
    try { rel = String(this.fallback.toRelativePath(ref)); }
    catch { return false; }
    return this.pathHeadIsMount(rel);
  }

  /** Is the first path segment a mount name? */
  private pathHeadIsMount(p: string): boolean {
    const sep = p.indexOf('/');
    const head = sep < 0 ? p : p.slice(0, sep);
    return this.mountMap.has(head);
  }

  async listFiles(selection: FileSelection = {}): Promise<UriNode> {
    // Fallback tree is the base; each mount appears as a top-level directory.
    // Drop any fallback child that collides with a mount name — the mount
    // owns that prefix, so a stale ./content/<mount> copy must not double-list.
    const root = await this.fallback.listFiles(selection);
    const children = (root.children ?? []).filter(c => !this.pathHeadIsMount(c.uri));
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
