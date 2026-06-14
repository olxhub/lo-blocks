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
//   # Everything else (baseline demos, transitional content). Optional;
//   # defaults to ./content (or $OLX_CONTENT_DIR).
//   fallback: ./content
//
// Without a config file, behavior is exactly the historical default: one
// FileStorageProvider over ./content. Config is read once per process —
// changing it requires a restart.
//
// Namespaces are NOT declared here — each source declares its own, via
// manifest.yaml at its root or the directory convention (namespaceFor).
// This file is about WHERE content lives; namespaces are WHAT it is.

import path from 'path';
import { FileStorageProvider } from './providers/file';
import { MountRouterProvider, type MountEntry } from './providers/mountRouter';
import { registerAllowedContentDir } from './allowedDirs';
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
}

export interface ContentSourcesConfig {
  /** mount name → checkout directory (string) or git remote (RepoSource) */
  sources: Record<string, string | RepoSource>;
  /** directory for unrouted paths */
  fallback: string;
}

/** The historical default — used when no config file exists. */
function defaultConfig(): ContentSourcesConfig {
  return {
    sources: {},
    fallback: process.env.OLX_CONTENT_DIR || './content',
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
 *   3. built-in: serve ./content (or $OLX_CONTENT_DIR), if neither exists
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
    fallback: parsed.fallback || process.env.OLX_CONTENT_DIR || './content',
  };
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
      // Directory form: a checkout on disk.
      registerAllowedContentDir(path.resolve(entry));
      mounts.push({
        mount,
        provider: new FileStorageProvider(entry, `content/${mount}`),
        baseDir: path.resolve(entry),
      });
    } else {
      // Repo form: served directly from the git remote, in memory.
      // Dynamic import keeps isomorphic-git/memfs out of client bundles.
      const { GitStorageProvider } = await import('./providers/git');
      mounts.push({
        mount,
        provider: new GitStorageProvider({
          url: entry.repo,
          ref: entry.branch,
          dir: entry.dir,
          cooldownMs: entry.cooldownSeconds !== undefined ? entry.cooldownSeconds * 1000 : undefined,
        }),
        // No baseDir: nothing on disk; assets not yet served for repo
        // sources (deferred — raw forge URLs or blob route later).
      });
    }
  }

  return new MountRouterProvider(mounts, fallback);
}
