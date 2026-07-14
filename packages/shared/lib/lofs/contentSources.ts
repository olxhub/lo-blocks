// packages/shared/lib/lofs/contentSources.ts
//
// Content-source configuration: which directories this deployment serves
// content from. SERVER-ONLY (reads the filesystem).
//
// Configured in config/content-sources.yaml:
//
//   # Each source is mounted at its key (the path prefix it appears under).
//   # Two forms:
//   #
//   # Directory — a checkout managed by dev-ops. Keep the mount equal to
//   # the directory name the content previously lived at, so paths, URLs,
//   # namespaces, and student state keys are unchanged. A bare string reads
//   # the WORKTREE (files as they are on disk — today's exact behavior,
//   # live edits included). The object form adds `worktree: false` to read
//   # the checkout's git HEAD instead (committed content only, served via
//   # the local .git; commits land as real git commits). A bare string is
//   # exactly `{ dir: <path>, worktree: true }`. `worktree: false` requires
//   # the directory to BE a git checkout (contain .git).
//   #
//   # Repo — served directly from a git remote (plain smart-HTTP protocol;
//   # any forge or bare repo). In-memory, read-only, head checked at most
//   # once per cooldown. By convention the mount is the repo basename,
//   # which is also its namespace (see docs/content-in-git.md).
//   sources:
//     psychology: /srv/content/psych              # directory form (worktree)
//     chemistry:                                  # directory form, git HEAD
//       dir: /srv/content/chem
//       worktree: false
//     edu.memphis.psych:                          # repo form
//       repo: https://github.com/olxhub/edu.memphis.psych
//       branch: main          # optional (default main) — the ref read+edited
//       publish: release      # optional; ref to publish to (default: branch).
//                             # Data-only today (readers still read `branch`);
//                             # the read-view/edit-view split is a later step.
//       cooldownSeconds: 60   # optional remote head-check throttle
//       tokenEnv: REPO_PAT    # optional; env var with a PAT for private reads
//                             # and pushes. Defaults to LO_GITHUB_TOKEN; set
//                             # only to point a repo at a different PAT.
//   # Everything else (baseline demos, transitional content). Optional;
//   # defaults to ./content.
//   fallback: ./content
//
// Without a config file, behavior is exactly the historical default: one
// FileStorageProvider over ./content.
//
// Two entry points (both build from config per call):
//   - readableProviders()  — the read/compile/render union over all sources
//   - sourceProvider(origin) — one source, repo-relative, for origin-scoped editing
//
// The config is re-read on every call, and the connected-source SET is
// assembled per call — deliberately NOT a process singleton, because that set
// is heading toward dynamic and user-specific (config now; postgres + dashboard
// "add repo" actions + forge repo-listing later). What IS cached across calls
// is each expensive per-repo git clone, keyed by repo identity (see
// gitSourceProvider) — so the union and an editing handle share one clone. Net
// effect today: adding a source takes effect on the next sync without a
// restart; removing one needs a restart to drop already-indexed content (the
// sync snapshot retains it).
//
// Namespaces are NOT declared here — each source declares its own, via
// manifest.yaml at its root or the directory convention (namespaceFor).
// This file is about WHERE content lives; namespaces are WHAT it is.

import { FileStorageProvider } from './providers/file';
import { gitOrigin, toLofsOrigin } from '../types/address';
import type { LofsOrigin } from '../types/address';
import { memoize } from '../util/async';
import type { StorageProvider } from '../types/storage';

const DEFAULT_CONFIG_PATH = 'config/content-sources.yaml';
const LOCAL_CONFIG_PATH = 'config/content-sources.local.yaml';

// Default places a repo source's access token (e.g. a GitHub PAT) is read from,
// when a source doesn't name its own. File-first: a file is more contained than
// an env var (which every child process inherits and logs/ps can leak). The
// default file is gitignored (config/*.pat); the env var is the fallback for
// deployments that inject secrets that way.
const DEFAULT_TOKEN_FILE = 'config/github.pat';
const DEFAULT_TOKEN_ENV = 'LO_GITHUB_TOKEN';

/**
 * Directory-form source (object form): a checkout on disk. The bare-string
 * form `mount: /path` is shorthand for `{ dir: /path, worktree: true }`.
 */
export interface DirectorySource {
  /** Checkout directory on disk. */
  dir: string;
  /**
   * Read the on-disk WORKTREE (default true — files as they are on disk, live
   * edits included; today's exact behavior, served by FileStorageProvider).
   * Set false to read the checkout's git HEAD instead (committed content only,
   * via the local `.git` — a local-mode GitStorageProvider; Studio commits land
   * as real git commits, no push). `worktree: false` requires `dir` to be a
   * git checkout (contain `.git`) — a config error names the fix otherwise.
   */
  worktree?: boolean;
}

/** Repo-form source: served directly from a git remote. */
export interface RepoSource {
  repo: string;
  /** Branch to READ and EDIT (default: main). Studio reads and commits here. */
  branch?: string;
  /**
   * Optional ref to PUBLISH to — the branch the read-view will eventually be
   * served from, distinct from the editing branch (`branch`). DEFAULTS to the
   * editing branch, so there is ZERO behavior change until a deployment sets
   * it: today every source carries both refs but readers still read `branch`.
   * The read-view switch (serve `publish` while Studio edits `branch`) is a
   * later step; this field only plumbs the data through so sources carry both.
   */
  publish?: string;
  /** May Studio commit + push to this source? Default false: a git source is
   *  read-only unless the deployment opts in, since editing someone else's
   *  course is the exception, not the rule. Local directories and the fallback
   *  are always writable. (Declared, not access-probed: confirming push rights
   *  needs a network round-trip per source; the deployment already knows its
   *  intent. A real access check can refine this later.) */
  writable?: boolean;
  cooldownSeconds?: number;
  /** Path to a file holding an access token (e.g. a GitHub PAT) for private
   *  reads and pushes. Preferred over `tokenEnv` (a file is more contained than
   *  an env var). Keep it gitignored. */
  tokenFile?: string;
  /** Name of the env var holding an access token. Alternative to `tokenFile`
   *  for deployments that inject secrets via env. */
  tokenEnv?: string;
  // Token resolution per source (see resolveRepoToken), first match wins:
  //   tokenFile → tokenEnv → default file (config/github.pat) → default env
  //   (LO_GITHUB_TOKEN) → anonymous (public). An explicit tokenFile/tokenEnv
  //   does NOT fall through to the defaults. Token is read once at construction;
  //   changing it needs a restart. The token is never logged.
}

export interface ContentSourcesConfig {
  /** mount name → checkout directory (string or DirectorySource) or git
   *  remote (RepoSource) */
  sources: Record<string, string | DirectorySource | RepoSource>;
  /** directory for unrouted paths */
  fallback: string;
  /** Whether the fallback (./content) is editable. Default false — a deploy
   *  shouldn't let anyone write the bundled content. Set true in a local
   *  config for dev. */
  fallbackWritable: boolean;
}

/** The built-in default — used when no config file exists. */
function defaultConfig(): ContentSourcesConfig {
  return {
    sources: {},
    fallback: './content',
    fallbackWritable: false,
  };
}

/**
 * Load the deployment's content-source configuration.
 *
 * Whole-file, NOT merged: the local override REPLACES the committed default,
 * so a deployment states exactly the sources it wants — and can drop defaults
 * it doesn't want (a merge can't express removal, and a custom deploy
 * shouldn't inherit the repo's stock sources). Precedence:
 *   1. config/content-sources.local.yaml  (gitignored, per-deployment)
 *   2. config/content-sources.yaml        (committed default)
 *   3. built-in: serve ./content, if neither file exists
 *
 * Content location is config-only — there is no environment override. A
 * deployment serving from elsewhere sets `fallback:` in its local.yaml.
 *
 * fs and yaml are imported dynamically so this module can be pulled into
 * client bundles (via lib/lofs) without breaking; only server code calls it.
 */
export async function loadContentSourcesConfig(): Promise<ContentSourcesConfig> {
  const fs = await import('fs/promises');
  const YAML = (await import('yaml')).default;

  let raw: string | null = null;
  for (const p of [LOCAL_CONFIG_PATH, DEFAULT_CONFIG_PATH]) {
    try { raw = await fs.readFile(p, 'utf-8'); break; } catch { /* try next */ }
  }
  if (raw === null) return defaultConfig();

  const parsed = YAML.parse(raw) ?? {};
  const sources: Record<string, string | DirectorySource | RepoSource> = parsed.sources ?? {};
  for (const [mount, entry] of Object.entries(sources)) {
    const isDir = typeof entry === 'string' && entry;
    const isDirObj = entry && typeof entry === 'object' && typeof (entry as DirectorySource).dir === 'string';
    const isRepo = entry && typeof entry === 'object' && typeof (entry as RepoSource).repo === 'string';
    if (isDirObj && isRepo) {
      throw new Error(
        `content-sources: source "${mount}" sets both "dir" and "repo" — pick one form`
      );
    }
    if (!isDir && !isDirObj && !isRepo) {
      throw new Error(
        `content-sources: source "${mount}" must be a directory path, ` +
        `{ dir: <path>, worktree?: <bool> }, or { repo: <url>, ... }`
      );
    }
  }
  return {
    sources,
    fallback: parsed.fallback || './content',
    fallbackWritable: parsed.fallbackWritable === true,  // opt-in; default read-only
  };
}

/**
 * Resolve a repo source's access token, file-first. First match wins:
 *   tokenFile → tokenEnv → default file (config/github.pat) → default env
 *   (LO_GITHUB_TOKEN) → undefined (anonymous).
 *
 * An EXPLICIT tokenFile/tokenEnv does not fall through to the defaults — if you
 * named a source and it's empty/missing, that's anonymous, not a surprise
 * pickup of the platform default. The token is read here and never logged.
 */
async function resolveRepoToken(entry: RepoSource): Promise<string | undefined> {
  const fs = await import('fs/promises');
  const fromFile = async (p: string): Promise<string | undefined> => {
    try { return (await fs.readFile(p, 'utf-8')).trim() || undefined; } catch { return undefined; }
  };
  const fromEnv = (name: string): string | undefined => process.env[name]?.trim() || undefined;

  if (entry.tokenFile) return fromFile(entry.tokenFile);
  if (entry.tokenEnv) return fromEnv(entry.tokenEnv);
  return (await fromFile(DEFAULT_TOKEN_FILE)) ?? fromEnv(DEFAULT_TOKEN_ENV);
}

// Live git provider instances, memoized by repo identity. A GitStorageProvider
// holds an in-memory clone + head cache + cooldown; building one per request
// would re-clone the repo every request, since that cache lives on the
// instance.
//
// Keyed by SOURCE (repo url + ref + normalized dir filter), NOT by the
// assembled set: two contexts connected to the same repo should share its
// clone (content is identity, not audience), and the connected-source set will
// become dynamic and user-specific. So instances are memoized here and the set
// is reassembled per call. No global "the content provider" singleton.
//
// memoize never caches a rejection (a failed construction retries) and has no
// TTL yet. TODO(dynamic-sources): add an LRU/TTL cap when sources churn
// (postgres-backed, per-user).
const gitSourceProvider = memoize(
  async (entry: RepoSource): Promise<StorageProvider> => {
    // Dynamic import keeps isomorphic-git/memfs out of client bundles.
    const { GitStorageProvider } = await import('./providers/git');
    // Token resolved once at construction (file-first; see resolveRepoToken).
    // A deploy-level service token today (GitHub PAT); per-user OAuth later
    // moves credentials to write time (the shared instance can't hold a
    // per-user token). Anonymous when none resolves → public reads.
    const token = await resolveRepoToken(entry);
    return new GitStorageProvider({
      url: entry.repo,
      ref: entry.branch ?? 'main',
      cooldownMs: entry.cooldownSeconds !== undefined ? entry.cooldownSeconds * 1000 : undefined,
      // GitHub PATs authenticate as the token in the username field.
      auth: token ? () => ({ username: token, password: 'x-oauth-basic' }) : undefined,
    });
  },
  { keyOf: (entry: RepoSource) => `${entry.repo}|${entry.branch ?? 'main'}` },
);

/**
 * A directory-form source with `worktree: false`: serve the checkout's git
 * HEAD through its on-disk `.git` (local-mode GitStorageProvider — committed
 * content only; Studio commits land as real git commits, no push). Fails with
 * an author-friendly config error when the directory isn't a git checkout.
 */
async function localGitProvider(mount: string, dir: string): Promise<StorageProvider> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const gitDir = path.join(dir, '.git');
  const hasGit = await fs.stat(gitDir).then(s => s.isDirectory() || s.isFile(), () => false);
  if (!hasGit) {
    throw new Error(
      `content-sources: source "${mount}" sets worktree: false, which serves the ` +
      `checkout's git HEAD — but "${dir}" has no .git. Point "dir" at a git checkout ` +
      `(or run \`git init && git add -A && git commit\` there), or remove ` +
      `"worktree: false" to serve the files directly.`
    );
  }
  // Dynamic import keeps isomorphic-git out of client bundles.
  const { GitStorageProvider } = await import('./providers/git');
  return new GitStorageProvider({
    // Same origin (file:content/<mount>) and default namespace (<mount>) as the
    // worktree form, so flipping the flag changes WHAT is served (HEAD vs
    // worktree), never the source's identity.
    local: { dir, mount: `content/${mount}`, defaultNs: mount },
  });
}

/**
 * One configured content source: its provider and its canonical ORIGIN — the
 * `source()` of the refs it emits, which is the editing handle (`sourceProvider`)
 * and the key the compile union merges by. `label`/`writable` are the
 * authoring-facing metadata Studio shows in its source picker.
 */
export interface ConfiguredSource {
  origin: LofsOrigin;
  /** Human label for the picker (the config mount key, or "Local content"). */
  label: string;
  /** May Studio write here? See RepoSource.writable. */
  writable: boolean;
  provider: StorageProvider;
  /** The ref Studio reads and commits to (RepoSource.branch, default main).
   *  Carried as data for the coming read-view/edit-view split (RepoSource.publish);
   *  readers still use this today. Undefined for non-repo sources. */
  editRef?: string;
  /** The ref to publish to (RepoSource.publish); defaults to editRef. Data only
   *  for now — nothing reads from it yet (see RepoSource.publish). */
  publishRef?: string;
}

/**
 * Authoring-facing view of a source: identity + what the picker needs, without
 * the provider handle. Returned by `sources()` (→ /api/sources → Studio).
 */
export interface SourceInfo {
  origin: LofsOrigin;
  label: string;
  writable: boolean;
}

/**
 * Build every configured source (+ the fallback) from config, computing each
 * one's origin. The single place that maps config → providers; both
 * `readableProviders` (read/compile) and `sourceProvider` (origin-scoped editing)
 * derive from it. Each file provider confines reads/writes to its own baseDir
 * (a root check — see providers/file.ts); no global allow-list. Git clones are
 * memoized (gitSourceProvider), so the union and an editing handle share one clone.
 *
 * Exported for tests, which pass an explicit `config`; production callers omit
 * it and get the deployment's config (loadContentSourcesConfig).
 */
export async function configuredSources(
  config?: ContentSourcesConfig,
): Promise<{ sources: ConfiguredSource[]; fallback: ConfiguredSource }> {
  config ??= await loadContentSourcesConfig();

  const fallback: ConfiguredSource = {
    origin: toLofsOrigin('file:content'),
    label: 'Local content',
    writable: config.fallbackWritable,  // default read-only; dev opts in via config
    provider: new FileStorageProvider(config.fallback, 'content'),
  };

  const sources: ConfiguredSource[] = [];
  for (const [mount, entry] of Object.entries(config.sources)) {
    if (typeof entry === 'string' || 'dir' in entry) {
      // Directory form: a checkout on disk. Bare string ≡ { dir, worktree: true }.
      // defaultNs = the mount name, so a collection that moved out of
      // ./content/<mount> keeps its namespace even with files at the checkout
      // root and no manifest. See namespaceFor.
      const { dir, worktree = true } = typeof entry === 'string' ? { dir: entry } : entry;
      sources.push({
        origin: toLofsOrigin(`file:content/${mount}`),
        label: mount,
        writable: true,  // local disk — always editable
        provider: worktree
          // Worktree (default, bare-string behavior): serve the files as they
          // are on disk, live edits included.
          ? new FileStorageProvider(dir, `content/${mount}`, { defaultNs: mount })
          // worktree: false — serve the checkout's git HEAD via its local .git.
          : await localGitProvider(mount, dir),
      });
    } else {
      // Repo form: served from the git remote, in memory. Read-only unless the
      // deployment opts in (entry.writable).
      const editRef = entry.branch ?? 'main';
      sources.push({
        origin: gitOrigin(entry.repo, editRef),
        label: mount,
        writable: entry.writable ?? false,
        provider: await gitSourceProvider(entry),
        editRef,
        // Defaults to the editing branch — zero behavior change until set.
        publishRef: entry.publish ?? editRef,
      });
    }
  }
  return { sources, fallback };
}

/**
 * The authoring-facing source list for Studio's picker: every configured
 * source plus the fallback, as `{ origin, label, writable }` (no provider).
 * Writable sources first, then read-only — the order the picker renders.
 */
export async function sources(): Promise<SourceInfo[]> {
  const { sources, fallback } = await configuredSources();
  const all = [fallback, ...sources].map(({ origin, label, writable }) => ({ origin, label, writable }));
  return [...all.filter(s => s.writable), ...all.filter(s => !s.writable)];
}

/**
 * The block-documentation provider (per-block docs.* namespaces). NOT a
 * configured content source: it serves example/sidecar files from the block
 * source tree so docs previews — and courses that embed docs via
 * `<Use ref="docs.ActionButton/..."/>` — can resolve relative `src=`/`data=`
 * references. It joins the read/compile union last (lowest priority).
 *
 * Dynamic import, not circular: BLOCK_REGISTRY pulls in every block's component
 * module (the whole block tree, including client-only UI code). Loading it
 * belongs to the first read that actually needs it, not to module load — the
 * union is the shared entry point for every read route, and most reads never
 * touch a docs file.
 */
async function docsProvider(): Promise<StorageProvider> {
  const { DocsStorageProvider } = await import('./providers/docs');
  const { BLOCK_REGISTRY } = await import('../../components/blockRegistry');
  return new DocsStorageProvider(
    Object.values(BLOCK_REGISTRY).filter((b: any) => b?._isBlock).map((b: any) => b.name)
  );
}

/**
 * The read/compile UNION as an ordered list of providers, for `sync` and the
 * read routes. NOT a stack object: each source's refs are origin-distinct, so
 * combining them is a merge, not a router (see lib/lofs/sourceSet.ts) — the
 * synthetic `<mount>/path` space (and its glob bug) is gone. Authoring goes
 * per-source via `sourceProvider`, not through here.
 *
 *   - `file:docs` → the block-documentation provider alone.
 *   - a specific origin → that one source's provider alone.
 *   - omitted → every configured source, then the fallback, then docs last.
 *     Priority is list order (sources shadow the fallback; the fallback shadows
 *     docs). Docs joins the union so the whole system content index — including
 *     documentation examples — is one compile.
 */
export async function readableProviders(source?: string): Promise<StorageProvider[]> {
  if (source === 'file:docs') return [await docsProvider()];
  if (source) return [await sourceProvider(toLofsOrigin(source))];

  const { sources, fallback } = await configuredSources();
  return [...sources.map(s => s.provider), fallback.provider, await docsProvider()];
}

/** A write was attempted against a source the deployment marked read-only.
 *  Routes map this to 403 — it's an authorization decision, not a failure. */
export class ReadOnlySourceError extends Error {
  constructor(origin: string) {
    super(`Source is read-only: ${origin}`);
    this.name = 'ReadOnlySourceError';
  }
}

/** Find the configured source for an origin, or throw if it isn't subscribed. */
async function findConfiguredSource(origin: LofsOrigin): Promise<ConfiguredSource> {
  const { sources, fallback } = await configuredSources();
  const match = [fallback, ...sources].find(s => s.origin === origin);
  if (!match) {
    throw new Error(`No configured content source for origin: ${origin}`);
  }
  return match;
}

/**
 * The single source identified by `origin`, repo-relative — the editing
 * handle. Authoring selects an origin (from the provenance ref it's editing)
 * and operates on this one provider; no synthetic mount-prefix paths, no
 * routing-by-guess. Throws if the origin isn't a configured source — you can't
 * edit a source the deployment hasn't subscribed to.
 *
 * READ handle: returns the provider for read-only sources too (browsing/reuse).
 * For writes use `writableSourceProvider`, which enforces the read-only gate.
 */
export async function sourceProvider(origin: LofsOrigin): Promise<StorageProvider> {
  return (await findConfiguredSource(origin)).provider;
}

/**
 * The editing handle for WRITES, for the API layer's request `source` param —
 * mirror of `readProvider`: it decodes the raw param to an origin at the
 * boundary, then refuses a source the deployment marked read-only (throws
 * ReadOnlySourceError → 403). The server's authority over writability,
 * independent of whatever backend credentials happen to permit. Routes pass the
 * raw `source` string; they don't brand it themselves.
 */
export async function writableSourceProvider(source: string): Promise<StorageProvider> {
  const match = await findConfiguredSource(toLofsOrigin(source));
  if (!match.writable) {
    throw new ReadOnlySourceError(source);
  }
  return match.provider;
}

/**
 * A single read handle for a REQUIRED source: the one provider identified by
 * `source`. For a caller that has an origin in hand and wants that source alone
 * (catalog descriptors, forge links). The union has no single provider, so a
 * caller that wants to span all sources uses `readableProviders()` and the
 * source-set operations (lib/lofs/sourceSet.ts) instead — this throws if
 * `source` is omitted.
 *
 * Special case: `file:docs` reaches the block-documentation provider — not a
 * configured content source, but readable by origin like one.
 */
export async function readProvider(source: string): Promise<StorageProvider> {
  if (!source) {
    throw new Error('readProvider requires a source origin; use readableProviders() to span all sources');
  }
  if (source === 'file:docs') return docsProvider();
  return sourceProvider(toLofsOrigin(source));
}
