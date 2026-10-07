// apps/server/src/deployIdentity.ts
//
// What is running here? One answer, three consumers.
//
// A stale platform on a server cost a debugging round because nothing could
// say what was deployed. The fix is not a better memory — it is that the
// deployment always tells you what it is, in every place you might look:
//
//   /api/deploy-info      (routes/deployInfo.ts) → the Ctrl+` debug panel
//   ndjson_header         (eventLog.ts)          → every event log file
//   SERVER_DEPLOY_IDENTITY (pipeline.ts)         → one record per connection,
//                                                  IN the event stream
//
// The last one is what makes "which build produced this event" answerable
// without correlating timestamps against a deploy log.
//
// SOURCE OF TRUTH: APP_HOME/.deploy-info, a JSON manifest that learning-ops
// merges into on every deploy — `ops deploy` writes the platform keys,
// `ops deploy-content` writes the content entries, neither erases the other
// (scripts/merge-deploy-info.py). The hono-server runs with
// WorkingDirectory=APP_HOME/lo-blocks, so the manifest is one level up.
//
// DEV: no manifest is normal, not an error. Report "development build" plus
// whatever git says. An unknown build is still an answer, and this module is
// what you reach for precisely when everything else is confusing.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// --- Types -------------------------------------------------------------------

export interface GitIdentity {
  sha?: string;
  branch?: string;
  describe?: string;
  dirty?: boolean;
}

export interface DeployIdentity {
  /** Where the answer came from. 'deploy-info' = a real deploy manifest. */
  source: 'deploy-info' | 'development' | 'unknown';
  /** Human-readable one-liner; the only field a panel header needs. */
  summary: string;
  deployedAt?: string;
  deployedBy?: string;
  host?: string;
  /** Platform repos: name → "url@sha", as the deploy playbook writes them. */
  repos?: Record<string, string>;
  /** Content repos: name → { sha, describe, branch, dirty, dirty_diff, ... }. */
  content?: Record<string, unknown>;
  /** Live git facts about the checkout this process is running from. */
  git?: GitIdentity;
  /** Which path answered, for when the answer is surprising. */
  manifestPath?: string;
  /** Non-fatal explanation when source is not 'deploy-info'. */
  note?: string;
}

// --- Manifest ----------------------------------------------------------------

/** Candidate manifest paths, most specific first. DEPLOY_INFO_PATH is the
 *  historical name (it predates this module); LO_DEPLOY_INFO is accepted as
 *  the name that matches the rest of the LO_ env prefix. */
export function manifestCandidates(): string[] {
  const explicit = process.env.DEPLOY_INFO_PATH ?? process.env.LO_DEPLOY_INFO;
  if (explicit) return [explicit];
  const appHome = process.env.APP_HOME;
  return [
    ...(appHome ? [path.join(appHome, '.deploy-info')] : []),
    path.join('..', '.deploy-info'),
    '.deploy-info',
  ];
}

function readManifest(candidates: string[]): { manifest: any; manifestPath: string } | null {
  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      if (manifest && typeof manifest === 'object') return { manifest, manifestPath: candidate };
    } catch {
      // Missing (dev) or half-written — try the next candidate.
    }
  }
  return null;
}

// --- Live git ----------------------------------------------------------------

/** Cheap, best-effort, never throws. A tarball deploy with no .git yields
 *  nothing, which is a fine answer. */
function git(...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function liveGit(): GitIdentity | undefined {
  const sha = git('rev-parse', 'HEAD');
  if (!sha) return undefined;
  // git() collapses empty output to undefined, which is exactly "clean".
  return {
    sha,
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    describe: git('describe', '--tags', '--always', '--dirty'),
    dirty: Boolean(git('status', '--porcelain')),
  };
}

// --- Assembly ----------------------------------------------------------------

/** "https://…/lo-blocks.git@a1b2c3d…" → "a1b2c3d45678" */
function shortSha(ref: string | undefined): string {
  if (!ref) return 'unknown';
  const at = ref.lastIndexOf('@');
  return (at < 0 ? ref : ref.slice(at + 1)).slice(0, 12);
}

/** Build the identity from a given set of candidate paths and git facts.
 *  Split out from buildDeployIdentity so tests can drive both halves without
 *  a real deploy or a real checkout. */
export function assembleDeployIdentity(
  candidates: string[],
  gitInfo: GitIdentity | undefined,
): DeployIdentity {
  const found = readManifest(candidates);

  if (!found) {
    return {
      source: gitInfo ? 'development' : 'unknown',
      summary: gitInfo
        ? `development build — ${gitInfo.describe ?? shortSha(gitInfo.sha)}` +
          `${gitInfo.branch ? ` (${gitInfo.branch})` : ''}${gitInfo.dirty ? ' [dirty]' : ''}`
        : 'unknown build — no deploy manifest and no git checkout',
      git: gitInfo,
      note: `No .deploy-info manifest found (tried ${candidates.join(', ')}); showing local git state.`,
    };
  }

  const { manifest, manifestPath } = found;
  return {
    source: 'deploy-info',
    summary:
      `lo-blocks ${shortSha(manifest?.repos?.['lo-blocks'])}` +
      (manifest?.deployed_at ? ` deployed ${manifest.deployed_at}` : '') +
      (manifest?.host ? ` on ${manifest.host}` : ''),
    deployedAt: manifest?.deployed_at,
    deployedBy: manifest?.deployed_by,
    host: manifest?.host,
    repos: manifest?.repos,
    content: manifest?.content,
    git: gitInfo,
    manifestPath,
  };
}

/** Read the manifest and the checkout fresh. */
export function buildDeployIdentity(): DeployIdentity {
  return assembleDeployIdentity(manifestCandidates(), liveGit());
}

/** Computed once, at boot. Stamping every connection must not shell out to
 *  git or stat the filesystem — and a deploy restarts the process, so a
 *  cached value cannot go stale without the cache going away with it.
 *  (/api/deploy-info deliberately does NOT use this: the endpoint exists to
 *  answer "is what I just deployed actually running", and a cached answer
 *  there is the exact failure mode it is meant to eliminate.) */
export const DEPLOY_IDENTITY: DeployIdentity = buildDeployIdentity();

// --- Connection stamp --------------------------------------------------------

/** Event type for the per-connection deploy stamp. */
export const SERVER_DEPLOY_IDENTITY = 'SERVER_DEPLOY_IDENTITY';

/**
 * The one record written at the head of every connection's event stream.
 *
 * WIRE SHAPE — why there is no top-level `id`, `scope`, `field`, or `tag`
 * ======================================================================
 * The server folds every event it receives into state (routeEvent →
 * ServerState.dispatch → updateResponseReducer). An unregistered event type
 * falls through to the plain-spread path, which writes its payload into
 * `component[action.id]` whenever a top-level `id` is present. Deploy
 * provenance must never become student state, so the envelope keys the
 * reducer routes on are simply absent — with no `id`, the spread path
 * returns state untouched. Same rule, same reason, as the error events
 * (packages/shared/lib/state/errorEvents.ts, "WIRE SHAPE").
 *
 * This record never goes through routeEvent today — it is appended straight
 * to the log — but it is shaped as if it might, because a record that is
 * only safe by virtue of its current call site is one refactor from being
 * unsafe.
 *
 * Lean: the manifest is a few hundred bytes and it is written ONCE per
 * connection, not per event.
 */
export function deployStampEvent(
  connectionId: string,
  identity: DeployIdentity = DEPLOY_IDENTITY,
): Record<string, unknown> {
  return {
    event: SERVER_DEPLOY_IDENTITY,
    connection: connectionId,
    stampedAt: new Date().toISOString(),
    source: identity.source,
    summary: identity.summary,
    ...(identity.deployedAt ? { deployedAt: identity.deployedAt } : {}),
    ...(identity.host ? { host: identity.host } : {}),
    ...(identity.repos ? { repos: identity.repos } : {}),
    ...(identity.content ? { content: identity.content } : {}),
    ...(identity.git ? { git: identity.git } : {}),
  };
}
