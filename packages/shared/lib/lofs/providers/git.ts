// packages/shared/lib/lofs/providers/git.ts
//
// Git storage provider — content served directly from a git remote.
//
// In-memory, forge-agnostic, read-only (for now):
//
// - Speaks the plain git smart-HTTP protocol via isomorphic-git, so
//   GitHub / GitLab / Forgejo / Codeberg / a bare repo behind nginx are
//   indistinguishable. No forge APIs.
// - The repository lives in an in-memory filesystem (memfs). No working
//   clone on disk, no git binary, nothing for dev-ops to manage — and no
//   path by which repo-supplied code could ever be executed.
// - Change detection is one request: the remote's branch head SHA, checked
//   at most once per cooldown period (throttle-friendly). Only on a head
//   change does the provider refetch, and the scan reports exact
//   added/changed/deleted from per-file blob SHAs — no mtime heuristics.
// - Versions are honest: every ref carries the blob SHA as its #version,
//   the inhabitant LofsCanonical was designed around. Provenance uses the
//   repo URL as the origin (`<url>://<path-in-repo>#<sha>`), per the
//   address grammar's git examples.
// - Writes throw: committing edits back to git repos is the
//   commit-on-write layer of docs/content-in-git.md, not yet implemented.
//   Studio correctly treats this content as read-only.
//
// Network use:
//   - listServerRefs: 1 small request per cooldown window
//   - clone (singleBranch, depth 1, noCheckout): only when the head moved
//
// On a head change the volume is discarded and re-cloned. Repos are small;
// a fresh shallow clone is simpler and safer than incremental fetch edge
// cases. Revisit if repo size ever makes this slow.

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { Volume } from 'memfs';
import YAML from 'yaml';
import { minimatch } from 'minimatch';
import { isContentFile, isMediaFile, getExtension } from '@/lib/util/fileTypes';
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
  NamespaceResolutionError,
} from '../../types/storage';
import {
  source, addressPath, withVersion, withoutVersion,
  makeAddress, toLofsOrigin, toLofsContentPath, toLofsVersion, toLofsCanonical,
  toLofsRef as brandLofsRef,
} from '../../types/address';
import { type ContentNamespace, validateContentNamespace, asContentNamespace, defaultNamespace } from '../../types/id-grammar';
import { fileTypes } from '../fileTypes';

const REPO_DIR = '/repo';

export interface GitProviderOptions {
  /** Remote URL (https smart-HTTP; any forge or bare repo). */
  url: string;
  /** Branch to serve (default: main). */
  ref?: string;
  /** Subtree(s) within the repo to serve (default: the whole repo). A file
   *  is served if it sits under any listed directory. Paths stay
   *  repo-relative — NOT stripped — so they map 1:1 to repo paths, which the
   *  future commit-on-write path needs. Accepts a string or a list; "/" and
   *  "" both mean the whole repo. */
  dir?: string | string[];
  /** Minimum ms between remote head checks (default: 60s). */
  cooldownMs?: number;
}

/** A file in the current served tree: repo-relative path → blob oid. */
interface TreeFile {
  oid: string;
}

export class GitStorageProvider implements StorageProvider {
  readonly url: string;
  readonly ref: string;
  /** Repo subtrees to serve, as clean prefixes (no leading/trailing slash).
   *  Empty = the whole repo (no filter). */
  readonly contentDirs: string[];
  readonly cooldownMs: number;

  private vol = new Volume();
  private head: string | null = null;
  private lastCheck = 0;
  /** repo-relative path → blob oid, for the current head. */
  private tree = new Map<string, TreeFile>();
  /** Serialize refreshes — concurrent syncs must not race the re-clone. */
  private refreshing: Promise<void> | null = null;

  constructor({ url, ref = 'main', dir, cooldownMs = 60_000 }: GitProviderOptions) {
    this.url = url.replace(/\/$/, '');
    this.ref = ref;
    this.contentDirs = (Array.isArray(dir) ? dir : dir === undefined ? [] : [dir])
      .map(d => d.replace(/^\/+|\/+$/g, ''))
      .filter(d => d !== '');  // "" and "/" both mean the whole repo → no filter
    this.cooldownMs = cooldownMs;
  }

  /** Is this repo-relative path within the served subtree(s)? */
  private included(repoPath: string): boolean {
    if (this.contentDirs.length === 0) return true;  // whole repo
    return this.contentDirs.some(d => repoPath === d || repoPath.startsWith(`${d}/`));
  }

  // ---------------------------------------------------------------------
  // Remote sync
  // ---------------------------------------------------------------------

  /** Fetch the remote head SHA. Overridable seam: tests use a local repo. */
  protected async fetchRemoteHead(): Promise<string> {
    const refs = await git.listServerRefs({
      http,
      url: this.url,
      prefix: `refs/heads/${this.ref}`,
    });
    const match = refs.find(r => r.ref === `refs/heads/${this.ref}`);
    if (!match) {
      throw new Error(`Branch "${this.ref}" not found on ${this.url}`);
    }
    return match.oid;
  }

  /** Clone the remote at the current head into a fresh volume. */
  protected async cloneRemote(): Promise<void> {
    this.vol = new Volume();
    await git.clone({
      fs: { promises: this.vol.promises } as any,
      http,
      dir: REPO_DIR,
      url: this.url,
      ref: this.ref,
      singleBranch: true,
      depth: 1,
      noCheckout: true,
      noTags: true,
    });
  }

  /** Ensure the in-memory repo reflects the remote, within the cooldown. */
  private async ensureFresh(): Promise<void> {
    // Within cooldown and already loaded: serve what we have.
    if (this.head && Date.now() - this.lastCheck < this.cooldownMs) return;
    // Single-flight: concurrent callers share one refresh.
    this.refreshing ??= this.refresh().finally(() => { this.refreshing = null; });
    await this.refreshing;
  }

  private async refresh(): Promise<void> {
    const remoteHead = await this.fetchRemoteHead();
    this.lastCheck = Date.now();
    if (remoteHead === this.head) return;

    await this.cloneRemote();
    this.head = await git.resolveRef({
      fs: { promises: this.vol.promises } as any,
      dir: REPO_DIR,
      ref: this.ref,
    });
    this.tree = await this.walkTree();
  }

  /** Enumerate content files (path → blob oid) under contentDir at head. */
  private async walkTree(): Promise<Map<string, TreeFile>> {
    const files = new Map<string, TreeFile>();
    await git.walk({
      fs: { promises: this.vol.promises } as any,
      dir: REPO_DIR,
      trees: [git.TREE({ ref: this.head! })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return;
        if ((await entry.type()) !== 'blob') return;
        if (!this.included(filepath)) return;
        const base = filepath.split('/').pop()!;
        if (!isContentFile(filepath) && base !== 'manifest.yaml') return;
        if (base.startsWith('.') || base.includes('~') || base.includes('#')) return;
        files.set(filepath, { oid: (await entry.oid()) });
      },
    });
    return files;
  }

  /** Read a blob by repo-relative path at the current head. */
  private async readBlob(repoPath: string): Promise<string> {
    const { blob } = await git.readBlob({
      fs: { promises: this.vol.promises } as any,
      dir: REPO_DIR,
      oid: this.head!,
      filepath: repoPath,
    });
    return new TextDecoder('utf-8').decode(blob);
  }

  // ---------------------------------------------------------------------
  // Refs: <url>://<path-in-repo>#<sha>
  // ---------------------------------------------------------------------

  private toRef(repoPath: string): LofsRef {
    return makeAddress(toLofsOrigin(this.url), toLofsContentPath(repoPath));
  }

  /** Repo-relative path from one of OUR refs. Throws on refs from another
   *  repo — how the mount router's fallthrough finds the owning provider. */
  private ownPath(ref: LofsRef | string): string {
    const branded = brandLofsRef(String(ref));
    if (String(source(branded)) !== this.url) {
      throw new Error(`Not a ref of ${this.url}: ${ref}`);
    }
    return String(addressPath(withoutVersion(branded)));
  }

  private guardPath(p: string): string {
    if (p.includes('\0') || p.split('/').some(s => s === '..') || p.startsWith('/')) {
      throw new Error(`Invalid path: ${p}`);
    }
    return p;
  }

  // ---------------------------------------------------------------------
  // StorageProvider
  // ---------------------------------------------------------------------

  async loadXmlFilesWithStats(previous: Record<LofsRef, XmlFileInfo> = {}): Promise<XmlScanResult> {
    await this.ensureFresh();

    // Only diff against our own refs (stacked/router scans pass everyone's).
    const mine: Record<string, XmlFileInfo> = {};
    for (const [key, info] of Object.entries(previous)) {
      try { this.ownPath(key); mine[key] = info; } catch { /* foreign */ }
    }

    const added: Record<LofsRef, XmlFileInfo> = {};
    const changed: Record<LofsRef, XmlFileInfo> = {};
    const unchanged: Record<LofsRef, XmlFileInfo> = {};
    const found = new Set<string>();

    for (const [relPath, { oid }] of this.tree) {
      const key = String(this.toRef(relPath));
      found.add(key);
      const id = toLofsCanonical(withVersion(brandLofsRef(key), toLofsVersion(oid)));
      const ext = getExtension(relPath) || relPath.split('.').pop() || '';
      const type = (fileTypes as any)[ext] ?? ext;
      const prev = mine[key];
      if (prev && prev.id === id) {
        unchanged[key as LofsRef] = prev;
      } else {
        const record: XmlFileInfo = {
          id,
          type,
          _metadata: { oid, head: this.head },
          content: await this.readBlob(relPath),
        };
        (prev ? changed : added)[key as LofsRef] = record;
      }
    }

    const deleted: Record<LofsRef, XmlFileInfo> = {};
    for (const [key, info] of Object.entries(mine)) {
      if (!found.has(key)) deleted[key as LofsRef] = info;
    }

    return { added, changed, unchanged, deleted };
  }

  async read(p: OlxRelativePath): Promise<ReadResult> {
    await this.ensureFresh();
    const relPath = this.guardPath(String(p).replace(/^\.?\//, ''));
    // Honor the configured subtree(s): a path outside `dir` is not served,
    // even though the whole repo is in memfs. Scan/glob/grep already filter
    // via included(); the direct-blob fallback below must too, or a read
    // could reach repo content the operator chose not to serve.
    if (!this.included(relPath)) {
      throw new Error(`File not found: ${p} (outside served subtree of ${this.url}#${this.ref})`);
    }
    const entry = this.tree.get(relPath);
    if (!entry) {
      // Tree only indexes content files; for other reads, try the blob directly.
      try {
        const content = await this.readBlob(relPath);
        return {
          content,
          metadata: { head: this.head },
          provenance: toLofsCanonical(withVersion(this.toRef(relPath), toLofsVersion(this.head!))),
          ns: await this.tryNamespace(relPath),
        };
      } catch {
        throw new Error(`File not found: ${p} (in ${this.url}#${this.ref})`);
      }
    }
    return {
      content: await this.readBlob(relPath),
      metadata: { oid: entry.oid, head: this.head },
      provenance: toLofsCanonical(withVersion(this.toRef(relPath), toLofsVersion(entry.oid))),
      ns: await this.tryNamespace(relPath),
    };
  }

  private async tryNamespace(relPath: string): Promise<ContentNamespace | undefined> {
    try {
      return (await this.namespaceFor(this.toRef(relPath))).ns;
    } catch (err) {
      if (err instanceof NamespaceResolutionError) return undefined;
      throw err;
    }
  }

  /**
   * Resolution: nearest ancestor manifest.yaml with a `namespace:` field,
   * else the repo name (defaultNamespace of the remote URL).
   *
   * The repo-name default is the deliberate difference from
   * FileStorageProvider's directory-name fallback: a git repo IS a content
   * collection, identified by its URL, so directory structure inside it is
   * free organization — not a namespace signal. (FileStorageProvider serves
   * one mount holding many collections, where the top-level directory is the
   * only thing that names them.) Manifests override: a repo holding several
   * sub-collections puts a manifest in each subtree.
   */
  async namespaceFor(ref: LofsRef): Promise<NamespaceResolution> {
    const relPath = this.ownPath(ref);
    await this.ensureFresh();

    // 1. Manifest walk, nearest first.
    const segments = relPath.split('/').slice(0, -1);
    for (let i = segments.length; i >= 0; i--) {
      const manifestRel = [...segments.slice(0, i), 'manifest.yaml'].join('/');
      const entry = this.tree.get(manifestRel);
      if (!entry) continue;
      const declared = YAML.parse(await this.readBlob(manifestRel))?.namespace;
      if (declared === undefined) continue;
      const valid = validateContentNamespace(String(declared));
      if (valid !== true) {
        throw new NamespaceResolutionError(`${this.url}: ${manifestRel}: ${valid}`);
      }
      return {
        ns: asContentNamespace(String(declared)),
        manifest: toLofsCanonical(withVersion(this.toRef(manifestRel), toLofsVersion(entry.oid))),
      };
    }

    // 2. Repo-name default — the repo's URL is the collection identity.
    try {
      return { ns: defaultNamespace(this.url) };
    } catch (err) {
      // Repo basename isn't a valid namespace (hyphens, leading digits, ...).
      throw new NamespaceResolutionError(
        `Cannot derive a namespace from repo URL "${this.url}": ${(err as Error).message} ` +
        `Add a manifest.yaml with an explicit "namespace:" field.`
      );
    }
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    await this.ensureFresh();
    // Flat path list → UriNode tree.
    const root: UriNode = { uri: '', children: [] };
    const dirs = new Map<string, UriNode>([['', root]]);
    const ensureDir = (dirPath: string): UriNode => {
      const existing = dirs.get(dirPath);
      if (existing) return existing;
      const parent = ensureDir(dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '');
      const node: UriNode = { uri: dirPath, children: [] };
      parent.children!.push(node);
      dirs.set(dirPath, node);
      return node;
    };
    for (const relPath of [...this.tree.keys()].sort()) {
      const dirPath = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
      ensureDir(dirPath).children!.push({ uri: relPath });
    }
    return root;
  }

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    await this.ensureFresh();
    const base = basePath ? String(basePath).replace(/^\.?\//, '').replace(/\/$/, '') + '/' : '';
    const out: OlxRelativePath[] = [];
    for (const relPath of this.tree.keys()) {
      if (base && !relPath.startsWith(base)) continue;
      if (minimatch(base ? relPath.slice(base.length) : relPath, pattern, { dot: false })) {
        out.push(relPath as OlxRelativePath);
      }
    }
    return out.sort();
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    await this.ensureFresh();
    const { basePath, include, limit = 1000 } = options;
    const base = basePath ? String(basePath).replace(/^\.?\//, '').replace(/\/$/, '') + '/' : '';
    const re = new RegExp(pattern);
    const matches: GrepMatch[] = [];
    for (const relPath of [...this.tree.keys()].sort()) {
      if (base && !relPath.startsWith(base)) continue;
      if (include && !minimatch(relPath, include)) continue;
      const lines = (await this.readBlob(relPath)).split('\n');
      for (let i = 0; i < lines.length && matches.length < limit; i++) {
        if (re.test(lines[i])) {
          matches.push({ path: relPath as OlxRelativePath, line: i + 1, content: lines[i] });
        }
      }
      if (matches.length >= limit) break;
    }
    return matches;
  }

  resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
    // Resolve against the base file's directory, within this repo.
    const basePath = this.ownPath(baseProvenance);
    const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
    const parts = (baseDir + '/' + relativePath).split('/').filter(s => s && s !== '.');
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        if (resolved.length === 0) {
          throw new Error(`Path traversal above content root: "${relativePath}" from "${baseProvenance}"`);
        }
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join('/') as SafeRelativePath;
  }

  toLofsRef(safePath: SafeRelativePath): LofsRef {
    return this.toRef(this.guardPath(String(safePath)));
  }

  toRelativePath(uri: LofsRef): OlxRelativePath {
    return this.ownPath(uri) as OlxRelativePath;
  }

  async validateAssetPath(assetPath: OlxRelativePath): Promise<boolean> {
    if (!isMediaFile(assetPath)) return false;
    await this.ensureFresh();
    const relPath = this.guardPath(String(assetPath));
    if (!this.included(relPath)) return false;  // outside the served subtree
    // Media isn't in the content-file tree; check the blob directly.
    try {
      await this.readBlob(relPath);
      return true;
    } catch {
      return false;
    }
  }

  // --- Writes: not yet. See docs/content-in-git.md (commit-on-write layer).

  private readOnly(): never {
    throw new Error(
      `${this.url} is a git-backed content source, currently read-only. ` +
      `Committing edits back to git is not implemented yet (docs/content-in-git.md).`
    );
  }

  async write(): Promise<void> { this.readOnly(); }
  async update(): Promise<void> { this.readOnly(); }
  async delete(): Promise<void> { this.readOnly(); }
  async rename(): Promise<void> { this.readOnly(); }
}
