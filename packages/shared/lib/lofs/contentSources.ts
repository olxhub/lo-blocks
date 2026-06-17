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
//   # namespaces, and student state keys are unchanged.
//   #
//   # Repo — served directly from a git remote (plain smart-HTTP protocol;
//   # any forge or bare repo). In-memory, read-only, head checked at most
//   # once per cooldown. By convention the mount is the repo basename,
//   # which is also its namespace (see docs/content-in-git.md).
//   sources:
//     psychology: /srv/content/psych              # directory form
//     edu.memphis.psych:                          # repo form
//       repo: https://github.com/olxhub/edu.memphis.psych
//       branch: main          # optional (default main)
//       dir: psychology       # optional content subdir within the repo
//       cooldownSeconds: 60   # optional remote head-check throttle
//       tokenEnv: GITHUB_TOKEN # optional; env var with a PAT for private
//                              # reads and pushes (writes)
//   # Everything else (baseline demos, transitional content). Optional;
//   # defaults to ./content.
//   fallback: ./content
//
// Without a config file, behavior is exactly the historical default: one
// FileStorageProvider over ./content.
//
// The config is re-read on every contentProvider() call, and the connected-
// source SET is assembled per call — deliberately NOT a process singleton,
// because that set is heading toward dynamic and user-specific (config now;
// postgres + dashboard "add repo" actions + forge repo-listing later). What
// IS cached across calls is each expensive per-repo git clone, keyed by repo
// identity (see gitSourceProvider below). Net effect today: adding a source takes
// effect on the next sync without a restart; removing one needs a restart to
// drop already-indexed content (the sync snapshot retains it).
//
// Namespaces are NOT declared here — each source declares its own, via
// manifest.yaml at its root or the directory convention (namespaceFor).
// This file is about WHERE content lives; namespaces are WHAT it is.

import path from 'path';
import { FileStorageProvider } from './providers/file';
import { MountRouterProvider, type MountEntry } from './providers/mountRouter';
import { registerAllowedContentDir } from './allowedDirs';
import { memoize } from '../util/async';
import type { StorageProvider } from '../types/storage';

const DEFAULT_CONFIG_PATH = 'config/content-sources.yaml';
const LOCAL_CONFIG_PATH = 'config/content-sources.local.yaml';

/** Repo-form source: served directly from a git remote. */
export interface RepoSource {
  repo: string;
  /** Branch (default: main). */
  branch?: string;
  /** Subtree(s) within the repo to serve (default: whole repo). String or list. */
  dir?: string | string[];
  cooldownSeconds?: number;
  /** Name of the env var holding an access token (e.g. a GitHub PAT) for
   *  private reads and pushes. The token stays out of the config file and the
   *  repo. Omit for public, read-only repos. Changing it needs a restart. */
  tokenEnv?: string;
}

export interface ContentSourcesConfig {
  /** mount name → checkout directory (string) or git remote (RepoSource) */
  sources: Record<string, string | RepoSource>;
  /** directory for unrouted paths */
  fallback: string;
}

/** The built-in default — used when no config file exists. */
function defaultConfig(): ContentSourcesConfig {
  return {
    sources: {},
    fallback: './content',
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
  const sources: Record<string, string | RepoSource> = parsed.sources ?? {};
  for (const [mount, entry] of Object.entries(sources)) {
    const isDir = typeof entry === 'string' && entry;
    const isRepo = entry && typeof entry === 'object' && typeof (entry as RepoSource).repo === 'string';
    if (!isDir && !isRepo) {
      throw new Error(
        `content-sources: source "${mount}" must be a directory path or { repo: <url>, ... }`
      );
    }
  }
  return {
    sources,
    fallback: parsed.fallback || './content',
  };
}

// Live git provider instances, memoized by repo identity. A GitStorageProvider
// holds an in-memory clone + head cache + cooldown; building one per request
// (as contentProvider used to) re-cloned the repo every request — the cache
// lived on the instance that was then discarded.
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
    // Token resolved once at construction from the named env var. A
    // deploy-level service token today (GitHub PAT); per-user OAuth later
    // moves credentials to write time (the shared instance can't hold a
    // per-user token). Anonymous when no tokenEnv / unset var → public reads.
    const token = entry.tokenEnv ? process.env[entry.tokenEnv] : undefined;
    return new GitStorageProvider({
      url: entry.repo,
      ref: entry.branch ?? 'main',
      dir: entry.dir,
      cooldownMs: entry.cooldownSeconds !== undefined ? entry.cooldownSeconds * 1000 : undefined,
      // GitHub PATs authenticate as the token in the username field.
      auth: token ? () => ({ username: token, password: 'x-oauth-basic' }) : undefined,
    });
  },
  { keyOf: repoKey },
);

/** Stable memo key for a repo source. Normalizes `dir` (strip slashes, drop
 *  empties, sort) so "psych", "/psych/", and ["psych"] — and lists in any
 *  order — all map to one clone of the same served content. (Until the
 *  config-type tightening lands, `dir` is still string | string[].) */
function repoKey(entry: RepoSource): string {
  const dirs = (Array.isArray(entry.dir) ? entry.dir : entry.dir == null ? [] : [entry.dir])
    .map(d => d.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .sort();
  return `${entry.repo}|${entry.branch ?? 'main'}|${JSON.stringify(dirs)}`;
}

/**
 * Build the deployment's content provider from configuration.
 *
 * - No sources configured → a single FileStorageProvider over the fallback
 *   directory (today's behavior, byte-identical refs).
 * - Sources configured → a MountRouterProvider: each source mounted at its
 *   name (provenance file:content/<mount>://...), fallback for the rest.
 *
 * Registers every configured directory with the file provider's security
 * allow-list (see allowedDirs.ts).
 */
export async function contentProvider(): Promise<StorageProvider> {
  const config = await loadContentSourcesConfig();

  registerAllowedContentDir(path.resolve(config.fallback));
  const fallback = new FileStorageProvider(config.fallback, 'content');

  const entries = Object.entries(config.sources);
  if (entries.length === 0) return fallback;

  const mounts: MountEntry[] = [];
  for (const [mount, entry] of entries) {
    if (typeof entry === 'string') {
      // Directory form: a checkout on disk. defaultNs = the mount name, so a
      // collection that moved out of ./content/<mount> keeps its namespace
      // even with files at the checkout root and no manifest (manifests still
      // override). See FileStorageProvider.namespaceFor.
      registerAllowedContentDir(path.resolve(entry));
      mounts.push({
        mount,
        provider: new FileStorageProvider(entry, `content/${mount}`, { defaultNs: mount }),
        baseDir: path.resolve(entry),
      });
    } else {
      // Repo form: served directly from the git remote, in memory (cached by
      // repo identity, see gitSourceProvider). No baseDir: nothing on disk;
      // assets not yet served for repo sources (deferred — forge URLs / blob route).
      mounts.push({ mount, provider: await gitSourceProvider(entry) });
    }
  }

  return new MountRouterProvider(mounts, fallback);
}
