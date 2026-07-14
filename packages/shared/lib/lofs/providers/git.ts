// packages/shared/lib/lofs/providers/git.ts
//
// Git storage provider — content served directly from a git remote.
//
// In-memory, forge-agnostic, read AND write:
//
// - Speaks the plain git smart-HTTP protocol via isomorphic-git, so
//   GitHub / GitLab / Forgejo / Codeberg / a bare repo behind nginx are
//   indistinguishable. No forge APIs.
// - The repository lives in an in-memory filesystem (memfs). No working
//   clone on disk, no git binary, nothing for dev-ops to manage — and no
//   path by which repo-supplied code could ever be executed.
// - Change detection is one request: the remote's branch head SHA, checked
//   at most once per cooldown period (throttle-friendly). Only on a head
//   change does the provider refetch; listContent then enumerates the tree
//   with honest per-file blob SHAs as versions — no mtime heuristics.
// - Versions are honest: every ref carries the blob SHA as its #version,
//   the inhabitant LofsCanonical was designed around. Provenance uses the
//   repo URL as the origin (`<url>://<path-in-repo>#<sha>`), per the
//   address grammar's git examples.
//
// Writes (commit-on-write — see docs/content-in-git.md):
// - A write builds a new tree by plumbing (writeBlob + writeTree from the
//   current commit's tree), commits it with parent = current head, and
//   pushes. No working tree / index — the clone stays noCheckout.
// - The platform commits on the AUTHOR's behalf: commit author = the teacher
//   (CommitOptions.author, from CurrentUser); committer = the platform
//   identity. Author rides per-write because one provider instance is shared
//   across users (see contentSources memoization).
// - Conflict detection has two layers: optimistic (read's blob-oid in
//   CommitOptions.base vs current) and authoritative (a non-fast-forward push
//   is rejected). Both surface as VersionConflictError → HTTP 409 upstream.
// - Writes are serialized per provider (writeLock): concurrent writes to
//   different files must not both fork from the same head and spuriously
//   collide at push.
//
// Auth: an injected credential resolver (GitProviderOptions.auth) supplies
// isomorphic-git onAuth for listServerRefs / clone / push — this is what
// enables private-repo reads AND pushes. Today the resolver yields a
// deploy-level token (a GitHub PAT; isomorphic-git has no SSH yet), so all
// pushes authenticate as one service identity and --author distinguishes
// teachers. When per-user OAuth lands, push credentials become per-write
// (the writing teacher's token), resolved at write time rather than baked
// into the shared instance. Reads stay deploy-level (audience-independent).
//
// Network use:
//   - listServerRefs: 1 small request per cooldown window
//   - clone (singleBranch, depth 1, noCheckout): only when the head moved
//   - push: once per write
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
  type ContentFile,
  type FileSelection,
  type UriNode,
  type ReadResult,
  type FileChange,
  type CommitOptions,
  type CommitResult,
  type GrepOptions,
  type GrepMatch,
  NamespaceResolutionError,
  VersionConflictError,
} from '../../types/storage';
import {
  source, addressPath, withVersion, withoutVersion,
  makeAddress, gitOrigin, forgeLink, toLofsOrigin, toLofsContentPath, toLofsVersion, toLofsCanonical,
  toLofsRef as brandLofsRef,
  type LofsOrigin, type LofsVersion, type ForgeLink,
} from '../../types/address';
import { type ContentNamespace, validateContentNamespace, asContentNamespace, defaultNamespace } from '../../types/id-grammar';
import { fileTypes } from '../fileTypes';
import { withRetry, throttle, singleFlight, type RetryPolicy } from '../../util/async';

const REPO_DIR = '/repo';

// Retry transient git transport failures (network blips, a flaky forge). A
// persistently failing remote is then backed off by the throttle in the
// refresh gate, so this never storms a down host.
const GIT_RETRY: RetryPolicy = { attempts: 3, baseMs: 200, maxMs: 2000 };

/** Platform identity recorded as the COMMITTER on every commit. The author
 *  is the teacher (CommitOptions.author); this is who physically committed.
 *  Also the author fallback when a write supplies none. */
const PLATFORM_IDENTITY = { name: 'Learning Observer', email: 'noreply@learning-observer.org' };

/** Strip a leading "./" or "/" so a client path becomes repo-relative. */
function stripLeadingSlash(p: string): string {
  return p.replace(/^\.?\//, '');
}

/** Normalize a basePath into a clean directory prefix ("a/b/"), or "" for no
 *  filter. Strips a leading "./" or "/" and ensures a single trailing slash. */
function basePrefix(basePath?: OlxRelativePath): string {
  return basePath ? stripLeadingSlash(String(basePath)).replace(/\/$/, '') + '/' : '';
}

/** isomorphic-git onAuth return shape (subset we use). */
export type GitCredentials = { username?: string; password?: string; headers?: Record<string, string> };

/** Resolves credentials for a repo's transport (reads + pushes). Returns null
 *  for anonymous access (public repos). Async so a future implementation can
 *  fetch a per-user OAuth token. */
export type GitCredentialResolver = () => GitCredentials | null | Promise<GitCredentials | null>;

/**
 * LOCAL mode: serve a git repo already checked out on disk, read through its
 * `.git` object store via isomorphic-git over the real filesystem (no clone, no
 * memfs, no network). Commits land in the local repo — there is no push. Used
 * for directory-form content sources and the bundled ./content fallback (which
 * is a SUBPATH of the parent lo-blocks repo — see `subpath`).
 */
export interface LocalGitOptions {
  /** Repo working-tree root on disk (the directory that contains `.git`, or
   *  whose ancestor does when `gitdir` is given). */
  dir: string;
  /** Explicit `.git` directory. Defaults to `<dir>/.git`. Pass this to point at
   *  a repo root above `dir` (the parent-repo-subpath case). */
  gitdir?: string;
  /** Repo-relative prefix this source is scoped to, e.g. "content". LOFS paths
   *  are relative to it: LOFS "demos/x.olx" ⇄ repo "content/demos/x.olx". Empty
   *  (default) serves the whole repo. */
  subpath?: string;
  /** Mount name — this source's LOFS origin is `file:<mount>`, exactly as a
   *  FileStorageProvider mounted there, so paths/URLs/namespaces/state keys are
   *  identical whether the source reads the worktree (file provider) or HEAD
   *  (this, in local mode). */
  mount: string;
  /** Fallback namespace when no manifest declares one (default: the mount).
   *  Directory-form sources mounted at `content/<name>` pass `<name>` here —
   *  the same value FileStorageProvider gets as defaultNs — so a source's
   *  namespace is identical whether it reads the worktree or HEAD. */
  defaultNs?: string;
}

export interface GitProviderOptions {
  /** Remote URL (https smart-HTTP; any forge or bare repo). Required for remote
   *  mode; omit when `local` is set. */
  url?: string;
  /** Branch to serve (default: main; local mode defaults to HEAD — whatever
   *  branch the checkout currently has checked out). */
  ref?: string;
  /** Minimum ms between remote head checks (default: 60s). Ignored in local mode. */
  cooldownMs?: number;
  /** Credential resolver for private reads and pushes (default: anonymous).
   *  Ignored in local mode (no network). */
  auth?: GitCredentialResolver;
  /** When set, serve an on-disk repo in LOCAL mode (see LocalGitOptions). */
  local?: LocalGitOptions;
}

/** The isomorphic-git filesystem environment: which fs + repo dir + gitdir
 *  every plumbing call runs against. Remote mode wraps a memfs clone; local
 *  mode wraps node:fs at the on-disk repo. */
interface GitEnv {
  fs: any;
  dir: string;
  gitdir?: string;
}

/** A file in the current served tree: repo-relative path → blob oid. */
interface TreeFile {
  oid: string;
}

/** An immutable snapshot of the in-memory repo, swapped as ONE reference and
 *  never mutated field-by-field: the object store (vol), the branch head it
 *  names, and the served-file index at that head. Because git objects are
 *  content-addressed and immutable, an operation that captures `this.state`
 *  once holds a fully consistent view no matter what a concurrent refresh
 *  does — git's own model (immutable objects + atomic ref repoint) applied to
 *  the provider's local state. */
interface RepoState {
  /** The fs/dir/gitdir every plumbing call runs against. */
  env: GitEnv;
  /** Remote mode only: the memfs clone, retained so push can read from it.
   *  Absent in local mode (nothing to push). */
  vol?: Volume;
  head: string;
  /** Content-file index, keyed by LOFS-relative path (the `subpath` prefix, if
   *  any, is already stripped). */
  tree: Map<string, TreeFile>;
}

export class GitStorageProvider implements StorageProvider {
  /** Remote URL (remote mode); '' in local mode. */
  readonly url: string;
  readonly ref: string;
  readonly cooldownMs: number;
  /** 'remote' (in-memory clone over smart-HTTP) or 'local' (on-disk .git). */
  readonly mode: 'remote' | 'local';
  /** Local-mode config (dir/gitdir/subpath/mount); undefined in remote mode. */
  private readonly local?: LocalGitOptions;
  /** Repo-relative prefix ('' unless local mode scopes to a subpath). */
  private readonly subpath: string;
  /** Canonical origin — the identity for this source's refs. Remote: the
   *  ref-bearing git origin (address.ts `gitOrigin`), carrying the branch. Local:
   *  `file:<mount>`, identical to a FileStorageProvider at that mount (so state
   *  keys/provenance are unchanged whether the source reads worktree or HEAD). */
  readonly origin: LofsOrigin;

  /** The current repo snapshot, or null until the first successful refresh.
   *  The ONE mutable pointer on this provider; refresh and commit publish by
   *  repointing it to a new RepoState (a single assignment), never by mutating
   *  the existing one in place. Every operation captures it once
   *  (requireState) and works against that stable value. */
  private state: RepoState | null = null;
  /** The refresh, gated by composed wrappers (outer→inner):
   *   - throttle: ≤ one attempt per cooldown; caches the result (success OR
   *     failure) for the window, so a down remote isn't re-hit every call.
   *   - singleFlight: only ONE refresh runs at a time, independent of cooldown.
   *   - withRetry: retry transient blips within a single attempt.
   *  Built here so it closes over the instance. */
  private readonly refreshGate: () => Promise<void>;

  /** Optional credential resolver (private reads + pushes). */
  private readonly auth?: GitCredentialResolver;

  /** Serializes mutations. Two concurrent writes must not both fork a commit
   *  from the same head and then collide at push — chain them. */
  private writeLock: Promise<unknown> = Promise.resolve();

  constructor({ url, ref, cooldownMs = 60_000, auth, local }: GitProviderOptions) {
    // Local mode defaults to HEAD (the checkout's current branch, whatever its
    // name); remote mode defaults to main.
    this.ref = ref ?? (local ? 'HEAD' : 'main');
    this.auth = auth;
    if (local) {
      // LOCAL mode: on-disk .git, no network. Origin is file:<mount>, matching
      // a FileStorageProvider at that mount. No cooldown — reading HEAD from a
      // local ref is cheap, so freshness is per-call.
      this.mode = 'local';
      this.local = { ...local, subpath: (local.subpath ?? '').replace(/^\/|\/$/g, '') };
      this.subpath = this.local.subpath ?? '';
      this.url = '';
      this.cooldownMs = 0;
      this.origin = toLofsOrigin(`file:${local.mount}`);
    } else {
      if (!url) throw new Error('GitStorageProvider: either `url` (remote) or `local` is required');
      this.mode = 'remote';
      this.subpath = '';
      this.url = url.replace(/\/$/, '');
      this.cooldownMs = cooldownMs;
      this.origin = gitOrigin(this.url, this.ref);  // validates + canonicalizes the transport
      // The grammar admits git+ssh and git: origins; this provider serves only
      // git+https (isomorphic-git speaks smart-HTTP, not ssh). Fail fast with a
      // clear message rather than an opaque clone error.
      if (!this.url.startsWith('https://')) {
        throw new Error(
          `GitStorageProvider serves git+https only; "${this.url}" is a valid origin ` +
          `but its transport isn't implemented yet.`
        );
      }
    }
    this.refreshGate = throttle(singleFlight(withRetry(() => this.refresh(), GIT_RETRY)), this.cooldownMs);
  }

  /** Human-facing source id for error messages (remote URL#ref, or local mount). */
  private get displayName(): string {
    return this.mode === 'local' ? `${this.local!.mount} (local git)` : `${this.url}#${this.ref}`;
  }

  /** Map a LOFS-relative path to its repo-relative path (adds the subpath prefix). */
  private toRepoPath(rel: string): string {
    return this.subpath ? `${this.subpath}/${rel}` : rel;
  }

  /** The on-disk fs environment for local mode. */
  private async localEnv(): Promise<GitEnv> {
    const fsPromises = await import('fs/promises');
    return { fs: { promises: fsPromises }, dir: this.local!.dir, gitdir: this.local!.gitdir };
  }

  /** isomorphic-git onAuth callback — yields resolved credentials, or {} for
   *  anonymous access (public repos). */
  protected onAuth = async (): Promise<GitCredentials> => (await this.auth?.()) ?? {};

  /** Run `fn` after any in-flight mutation completes (serial mutation queue). */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(fn, fn);
    this.writeLock = run.then(() => undefined, () => undefined);
    return run;
  }

  /** The loaded snapshot — ensureFresh() must have run first. Capture it ONCE
   *  per operation (`const s = this.requireState()`) and read s.vol/head/tree
   *  throughout, so a concurrent refresh repoint can't tear the view. */
  private requireState(): RepoState {
    if (!this.state) throw new Error(`${this.displayName} is not loaded`);
    return this.state;
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
      onAuth: this.onAuth,
    });
    const match = refs.find(r => r.ref === `refs/heads/${this.ref}`);
    if (!match) {
      throw new Error(`Branch "${this.ref}" not found on ${this.url}`);
    }
    return match.oid;
  }

  /** Clone the remote at the current head into a FRESH volume and return it.
   *  Returns the volume so refresh() can assemble a complete snapshot and
   *  publish it by one atomic repoint — a failed clone never replaces the live
   *  snapshot. */
  protected async cloneRemote(): Promise<Volume> {
    const vol = new Volume();
    await git.clone({
      fs: { promises: vol.promises } as any,
      http,
      dir: REPO_DIR,
      url: this.url,
      ref: this.ref,
      singleBranch: true,
      depth: 1,
      noCheckout: true,
      noTags: true,
      onAuth: this.onAuth,
    });
    return vol;
  }

  /** Ensure the in-memory repo reflects the remote. Timing (one attempt per
   *  cooldown), concurrent-call coalescing, transient-failure retry, and
   *  down-remote backoff all live in refreshGate (see the field). */
  private ensureFresh(): Promise<void> {
    return this.refreshGate();
  }

  private async refresh(): Promise<void> {
    if (this.mode === 'local') {
      // On-disk repo: no clone. Read HEAD straight from the local ref; rescan
      // the tree only when it moved. generationToken is this head (whole-repo
      // oid — a parent-repo commit outside the subpath forces a harmless
      // rescan, the accepted coarseness).
      const env = await this.localEnv();
      const head = await git.resolveRef({ ...env, ref: this.ref });
      if (head === this.state?.head) return;
      this.state = { env, head, tree: await this.walkTree(env, head) };
      return;
    }

    const remoteHead = await this.fetchRemoteHead();
    if (remoteHead === this.state?.head) return;

    // Build the whole snapshot in a local, then publish by a single atomic
    // repoint. A failed clone/walk leaves the previous snapshot intact — and
    // since head is unchanged, the next refresh retries rather than serving a
    // half-built volume.
    const vol = await this.cloneRemote();
    const env: GitEnv = { fs: { promises: vol.promises }, dir: REPO_DIR };
    const head = await git.resolveRef({ ...env, ref: this.ref });
    const tree = await this.walkTree(env, head);
    this.state = { env, vol, head, tree };
  }

  /** Enumerate content files (LOFS-relative path → blob oid) under the served
   *  subpath at `head`. Keys have the subpath prefix stripped. */
  private async walkTree(env: GitEnv, head: string): Promise<Map<string, TreeFile>> {
    const files = new Map<string, TreeFile>();
    const prefix = this.subpath ? `${this.subpath}/` : '';
    await git.walk({
      ...env,
      trees: [git.TREE({ ref: head })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return;
        if (prefix && !filepath.startsWith(prefix)) return;
        if ((await entry.type()) !== 'blob') return;
        const base = filepath.split('/').pop()!;
        if (!isContentFile(filepath) && base !== 'manifest.yaml') return;
        if (base.startsWith('.') || base.includes('~') || base.includes('#')) return;
        files.set(prefix ? filepath.slice(prefix.length) : filepath, { oid: (await entry.oid()) });
      },
    });
    return files;
  }

  /** Read a blob by LOFS-relative path at the snapshot's head. */
  private async readBlob(s: RepoState, relPath: string): Promise<string> {
    const { blob } = await git.readBlob({
      ...s.env,
      oid: s.head,
      filepath: this.toRepoPath(relPath),
    });
    return new TextDecoder('utf-8').decode(blob);
  }

  // ---------------------------------------------------------------------
  // Refs: <canonical-git-origin>://<path-in-repo>#<blob-sha>
  //   e.g. git+https:github.com/olxhub/lo-blocks.git@main://unit1/x.olx#<sha>
  // ---------------------------------------------------------------------

  private toRef(repoPath: string): LofsRef {
    return makeAddress(this.origin, toLofsContentPath(repoPath));
  }

  /** Repo-relative path from one of OUR refs. Throws on refs from another
   *  origin — how the mount router's fallthrough finds the owning provider. */
  private ownPath(ref: LofsRef | string): string {
    const branded = brandLofsRef(String(ref));
    if (String(source(branded)) !== String(this.origin)) {
      throw new Error(`Not a ref of ${this.origin}: ${ref}`);
    }
    return String(addressPath(withoutVersion(branded)));
  }

  /** The #version stamped on a content file's ref: the blob SHA — object
   *  identity, stable across commits, so unchanged files stay "unchanged" in
   *  the scan. SINGLE FLIP SEAM for version policy: to stamp the commit SHA
   *  instead (more lineage context), return the head here and thread it from
   *  the call sites. Every file would then look changed each commit — the scan
   *  re-parses the snapshot — which is acceptable, since a head move already
   *  re-clones the whole repo. */
  private contentVersion(blobOid: string): LofsVersion {
    return toLofsVersion(blobOid);
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

  async listContent(): Promise<ContentFile[]> {
    await this.ensureFresh();
    const s = this.requireState();

    const out: ContentFile[] = [];
    for (const [relPath, { oid }] of s.tree) {
      const ext = getExtension(relPath) || relPath.split('.').pop() || '';
      const type = (fileTypes as any)[ext] ?? ext;
      // Version is the blob SHA — object identity, stable across commits for
      // untouched files, and the SAME version read() stamps on provenance (so
      // a parseDep recorded from a read compares equal here when unchanged).
      out.push({
        id: toLofsCanonical(withVersion(this.toRef(relPath), this.contentVersion(oid))),
        type,
        content: await this.readBlob(s, relPath),
      });
    }
    return out;
  }

  /** Cheap change token: the last-known branch head. Freshness is governed by
   *  the SAME cooldown as re-clone decisions (ensureFresh → refreshGate), never
   *  a per-call remote round-trip — within the cooldown window this returns the
   *  cached head with no network. A refresh failure (down remote) is swallowed:
   *  the token stays at the last-known head, so the sync keeps serving the
   *  cached snapshot instead of thrashing. Empty until the first load. */
  async generationToken(): Promise<string> {
    try {
      await this.ensureFresh();
    } catch {
      // Down remote / transient blip — report the last-known head unchanged.
    }
    return this.state?.head ?? '';
  }

  async read(p: OlxRelativePath): Promise<ReadResult> {
    // TODO(stale-read): ensureFresh throws if a head re-check fails within the
    // cooldown, even when the snapshot's tree still holds the blob. A studio read during
    // a transient remote blip would degrade more gracefully by serving the
    // last-known content than by throwing. Safe as-is: the sync path tolerates
    // it (mount-router isolation + snapshot retention).
    await this.ensureFresh();
    const s = this.requireState();
    const relPath = this.guardPath(stripLeadingSlash(String(p)));
    const entry = s.tree.get(relPath);
    if (!entry) {
      // Tree only indexes content files; for other reads, try the blob directly.
      try {
        const content = await this.readBlob(s, relPath);
        return {
          content,
          metadata: { head: s.head },
          provenance: toLofsCanonical(withVersion(this.toRef(relPath), toLofsVersion(s.head))),
          ns: await this.tryNamespace(relPath),
        };
      } catch {
        throw new Error(`File not found: ${p} (in ${this.displayName})`);
      }
    }
    return {
      content: await this.readBlob(s, relPath),
      metadata: { oid: entry.oid, head: s.head },
      provenance: toLofsCanonical(withVersion(this.toRef(relPath), this.contentVersion(entry.oid))),
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
    const s = this.requireState();

    // 1. Manifest walk, nearest first. Read each ancestor manifest directly
    //    by blob, so a manifest at any level governs the content beneath it.
    const segments = relPath.split('/').slice(0, -1);
    for (let i = segments.length; i >= 0; i--) {
      const manifestRel = [...segments.slice(0, i), 'manifest.yaml'].join('/');
      let raw: string;
      try { raw = await this.readBlob(s, manifestRel); } catch { continue; }  // none at this level
      const declared = YAML.parse(raw)?.namespace;
      if (declared === undefined) continue;
      const valid = validateContentNamespace(String(declared));
      if (valid !== true) {
        throw new NamespaceResolutionError(`${this.displayName}: ${manifestRel}: ${valid}`);
      }
      const oid = await this.currentBlobOid(s, manifestRel);  // for versioned provenance
      return {
        ns: asContentNamespace(String(declared)),
        manifest: oid
          ? toLofsCanonical(withVersion(this.toRef(manifestRel), this.contentVersion(oid)))
          : undefined,
      };
    }

    // 2. Collection default (no manifest declared one).
    if (this.mode === 'local') {
      // Local mode is a directory-form / fallback source: defaultNs (or the
      // mount) names the collection, mirroring FileStorageProvider's defaultNs
      // — so a checkout's namespace is unchanged whether it's read from the
      // worktree or from HEAD.
      const ns = this.local!.defaultNs ?? this.local!.mount;
      const valid = validateContentNamespace(ns);
      if (valid !== true) {
        throw new NamespaceResolutionError(
          `Default namespace "${ns}" for mount "${this.local!.mount}" is invalid: ${valid}. ` +
          `Add a manifest.yaml with an explicit "namespace:" field.`
        );
      }
      return { ns: asContentNamespace(ns) };
    }
    // Remote mode: the repo's URL is the collection identity.
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

  /** Forge link for this repo (or a file within it) at the served ref. Null in
   *  local mode (no forge), or when the origin's forge has no web view we map. */
  forgeLink(path?: OlxRelativePath): ForgeLink | null {
    if (this.mode === 'local') return null;
    return forgeLink(this.origin, path);
  }

  async listFiles(_selection: FileSelection = {}): Promise<UriNode> {
    await this.ensureFresh();
    const s = this.requireState();
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
    for (const relPath of [...s.tree.keys()].sort()) {
      const dirPath = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
      ensureDir(dirPath).children!.push({ uri: relPath });
    }
    return root;
  }

  async glob(pattern: string, basePath?: OlxRelativePath): Promise<OlxRelativePath[]> {
    await this.ensureFresh();
    const s = this.requireState();
    const base = basePrefix(basePath);
    const out: OlxRelativePath[] = [];
    for (const relPath of s.tree.keys()) {
      if (base && !relPath.startsWith(base)) continue;
      if (minimatch(base ? relPath.slice(base.length) : relPath, pattern, { dot: false })) {
        out.push(relPath as OlxRelativePath);
      }
    }
    return out.sort();
  }

  async grep(pattern: string, options: GrepOptions = {}): Promise<GrepMatch[]> {
    await this.ensureFresh();
    const s = this.requireState();
    const { basePath, include, limit = 1000 } = options;
    const base = basePrefix(basePath);
    const re = new RegExp(pattern);
    const matches: GrepMatch[] = [];
    for (const relPath of [...s.tree.keys()].sort()) {
      if (base && !relPath.startsWith(base)) continue;
      if (include && !minimatch(relPath, include)) continue;
      const lines = (await this.readBlob(s, relPath)).split('\n');
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
    const s = this.requireState();
    const relPath = this.guardPath(String(assetPath));
    // Media isn't in the content-file tree; check the blob directly.
    try {
      await this.readBlob(s, relPath);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Writes — commit-on-write (see the header). Serialized, and the repo is
  // brought current before forking a commit from head. One commit() applies
  // N adds/overwrites + deletes + renames as ONE tree delta, ONE commit, ONE
  // push.
  // ---------------------------------------------------------------------

  async commit(changes: FileChange[], options: CommitOptions = {}): Promise<CommitResult> {
    return this.serialize(async () => {
      await this.ensureFresh();
      const s = this.requireState();

      // Optimistic conflict: every base's blob oid must still be current
      // (skipped with force). The authoritative check is the push rejection.
      if (!options.force) {
        for (const b of options.base ?? []) {
          await this.checkBase(s, this.requireWritable(b.path), b.version);
        }
      }

      // Lower each change to path→blob deltas (null blob = delete). A rename is
      // an add-at-new + delete-at-old carrying the existing blob oid.
      const deltas: Array<{ path: string; blobOid: string | null }> = [];
      const written: string[] = [];  // paths whose new blob oid we report
      for (const c of changes) {
        const relPath = this.requireWritable(c.path);
        if (c.delete) {
          if ((await this.currentBlobOid(s, relPath)) === null) {
            throw new Error(`File not found: ${c.path} (in ${this.displayName})`);
          }
          deltas.push({ path: relPath, blobOid: null });
        } else if (c.renameTo !== undefined) {
          const to = this.requireWritable(c.renameTo);
          const oid = await this.currentBlobOid(s, relPath);
          if (oid === null) throw new Error(`File not found: ${c.path} (in ${this.displayName})`);
          deltas.push({ path: to, blobOid: oid }, { path: relPath, blobOid: null });
          written.push(to);
        } else if (c.content !== undefined) {
          const blobOid = await git.writeBlob({
            ...s.env,
            blob: new TextEncoder().encode(c.content),
          });
          deltas.push({ path: relPath, blobOid });
          written.push(relPath);
        } else {
          throw new Error(`Empty change for "${c.path}": set content, delete, or renameTo`);
        }
      }

      const newHead = await this.applyCommit(s, deltas, options.message ?? defaultMessage(changes), options.author);

      // New tokens: blob oid + the new head, matching read()'s content metadata.
      const versions: Record<string, unknown> = {};
      for (const d of deltas) {
        if (d.blobOid !== null && written.includes(d.path)) {
          versions[d.path] = { oid: d.blobOid, head: newHead };
        }
      }
      return { versions };
    });
  }

  /** Validate a write target and return its repo-relative path. */
  private requireWritable(p: OlxRelativePath): string {
    return this.guardPath(stripLeadingSlash(String(p)));
  }

  /** Optimistic conflict: the blob oid a caller last read (base.version) must
   *  still be current. The authoritative check is the non-fast-forward push
   *  rejection. */
  private async checkBase(s: RepoState, relPath: string, version: unknown): Promise<void> {
    const prev = (version ?? {}) as { oid?: string };
    if (prev.oid === undefined) return;  // nothing to compare (e.g. a non-content read)
    const current = await this.currentBlobOid(s, relPath);
    if (prev.oid !== current) {
      throw new VersionConflictError(
        'File has been modified since last read',
        { oid: current, head: s.head },
      );
    }
  }

  /** Blob oid at a LOFS-relative path under the snapshot's head, or null if absent. */
  private async currentBlobOid(s: RepoState, relPath: string): Promise<string | null> {
    try {
      const { oid } = await git.readBlob({
        ...s.env,
        oid: s.head,
        filepath: this.toRepoPath(relPath),
      });
      return oid;
    } catch {
      return null;
    }
  }

  /** Apply a set of path→blob deltas (null blob = delete) as one commit on the
   *  captured snapshot `s`, push it, then publish a new snapshot locally and
   *  return the new head. Built by tree plumbing — no working tree or index, so
   *  the clone stays noCheckout. All git reads/writes go through s.vol/s.head,
   *  so a concurrent refresh repoint can't mix this commit across volumes. */
  private async applyCommit(
    s: RepoState,
    changes: Array<{ path: string; blobOid: string | null }>,
    message: string,
    author?: { name: string; email: string },
  ): Promise<string> {
    const env = s.env;
    const { commit } = await git.readCommit({ ...env, oid: s.head });
    let treeOid = commit.tree;
    for (const c of changes) {
      // Tree deltas are keyed by REPO path (subpath prefix applied), so a
      // subpath-scoped source (e.g. the ./content fallback in the parent repo)
      // commits under content/ rather than at the repo root.
      treeOid = await this.updateTree(s, treeOid, this.toRepoPath(c.path).split('/'), c.blobOid);
    }
    const newHead = await git.commit({
      ...env,
      message,
      tree: treeOid,
      parent: [s.head],
      author: author ?? PLATFORM_IDENTITY,   // teacher (or platform fallback)
      committer: PLATFORM_IDENTITY,           // who physically committed
      // 'HEAD' (local-mode default) is symbolic: OMIT ref so isomorphic-git
      // resolves HEAD to the checkout's current branch and advances that ref.
      // (Passing 'HEAD' literally would overwrite .git/HEAD → detached HEAD.)
      ...(this.ref === 'HEAD' ? {} : { ref: `refs/heads/${this.ref}` }),
    });
    // Remote mode pushes; local mode commits to the on-disk repo only (no push).
    if (this.mode === 'remote') {
      try {
        await this.pushRemote(s.vol!);
      } catch (err: any) {
        // A non-fast-forward rejection means the branch moved under this edit.
        if (err?.code === 'PushRejectedError' || /fast-forward|rejected/i.test(err?.message ?? '')) {
          throw new VersionConflictError(
            `Push to ${this.displayName} rejected — the branch moved since this edit; reload and retry. (${err.message})`,
          );
        }
        throw err;
      }
    }
    // Commit (+ push, remote) succeeded — publish a NEW snapshot (built on s,
    // whose store now contains newHead) by an atomic repoint, so reads see the
    // edit immediately. A new tree Map (not a mutation of s.tree) keeps any
    // snapshot a concurrent reader still holds intact. Skip if a refresh
    // repointed away from s meanwhile — the pushed/committed commit is picked up
    // by the next refresh regardless.
    if (this.state === s) {
      const tree = new Map(s.tree);
      for (const c of changes) {
        if (c.blobOid === null) tree.delete(c.path);
        else if (this.servesPath(c.path)) tree.set(c.path, { oid: c.blobOid });
      }
      this.state = { env: s.env, vol: s.vol, head: newHead, tree };
    }
    return newHead;
  }

  /** Would walkTree index this path? (Mirrors its filter for local tree upkeep.) */
  private servesPath(repoPath: string): boolean {
    const base = repoPath.split('/').pop()!;
    return isContentFile(repoPath) || base === 'manifest.yaml';
  }

  /** Build a new tree oid from `treeOid` with `segments` set to `blobOid`
   *  (or removed when null). Recurses, rebuilding only the touched path;
   *  prunes directories left empty by a delete. */
  private async updateTree(s: RepoState, treeOid: string, segments: string[], blobOid: string | null): Promise<string> {
    const env = s.env;
    const { tree } = await git.readTree({ ...env, oid: treeOid });
    const [seg, ...rest] = segments;
    const others = tree.filter((e: any) => e.path !== seg);

    if (rest.length === 0) {
      const next = blobOid === null
        ? others
        : [...others, { mode: '100644', path: seg, oid: blobOid, type: 'blob' as const }];
      return git.writeTree({ ...env, tree: next });
    }

    const existing = tree.find((e: any) => e.path === seg && e.type === 'tree');
    if (!existing && blobOid === null) return treeOid;  // deleting under a nonexistent dir: no-op
    const subOid = existing
      ? existing.oid
      : await git.writeTree({ ...env, tree: [] });  // fresh empty subtree
    const newSub = await this.updateTree(s, subOid, rest, blobOid);
    const newSubEntries = (await git.readTree({ ...env, oid: newSub })).tree;
    const next = newSubEntries.length === 0
      ? others  // prune the directory a delete just emptied
      : [...others, { mode: '040000', path: seg, oid: newSub, type: 'tree' as const }];
    return git.writeTree({ ...env, tree: next });
  }

  /** Push the local branch to the remote — the network transport seam.
   *  Overridable: tests whose "remote" IS the in-memory repo no-op this (the
   *  commit already landed there). Rejection handling lives in applyCommit,
   *  which maps a thrown PushRejectedError → VersionConflictError; here we
   *  only normalize the "ok: false" result into that same thrown shape so the
   *  two push-failure forms map uniformly. */
  protected async pushRemote(vol: Volume): Promise<void> {
    const result = await git.push({
      fs: { promises: vol.promises } as any,
      http,
      dir: REPO_DIR,
      url: this.url,
      remote: 'origin',
      ref: this.ref,
      onAuth: this.onAuth,
    }) as { ok?: boolean; error?: string | null; errors?: string[] };
    if (result && result.ok === false) {
      const e: any = new Error(`push rejected: ${JSON.stringify(result.error ?? result.errors ?? result)}`);
      e.code = 'PushRejectedError';
      throw e;
    }
  }
}

/** Default commit message when the caller supplies none. */
function defaultMessage(changes: FileChange[]): string {
  if (changes.length === 1) {
    const [c] = changes;
    if (c.delete) return `Delete ${c.path}`;
    if (c.renameTo !== undefined) return `Rename ${c.path} → ${c.renameTo}`;
    return `Update ${c.path}`;
  }
  return `Update ${changes.length} files`;
}
