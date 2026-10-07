// packages/shared/lib/records/remote.ts
//
// WHERE a course's archive lives, and whether it is reachable right now.
//
// THE LOCATION IS A SETTING, THE CREDENTIALS ARE NOT. `config/system.pmss`
// carries the default so a clone works, `config/local.pmss` (gitignored)
// overrides it per deployment, and a course may name its own in its rubric
// frontmatter. Credentials live only in ~/.config/rclone/rclone.conf, outside
// the tree. NOTE local.pmss is embedded in static browser bundles, so even the
// LOCATION override there must be non-secret -- a credential must never go near
// it.
//
// THE FOLDER ID IS NOT OPTIONAL, and getting this wrong reports a healthy
// remote as dead. Measured 2026-10-07: `rclone lsd coursedata:scoring_course_data`
// exits 3, "directory not found"; the same path with --drive-root-folder-id
// lists correctly. Every call made here goes through `rcloneArgs` so the doctor
// addresses the remote exactly as the uploader does.
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { initConfig, resolveConfig } from '@/lib/config';
import { loBlocksRoot } from '@/lib/llm/enforce/courseData';

export interface RemoteSpec {
  /** rclone destination, e.g. `coursedata:scoring_course_data/courses/<ns>`. */
  path: string;
  /** Drive folder id this path is relative to, or null. */
  folderId: string | null;
}

/**
 * pmss returns a quoted value WITH ITS QUOTES. Measured: `archive-remote`
 * resolved to `"coursedata:..."`, and the quotes went straight into the rclone
 * path, which then failed in 85ms and read as an unreachable remote rather than
 * a malformed one. Quoting is required in pmss for a value containing a colon,
 * so this is not avoidable by writing the setting differently.
 */
function unquote(v: string | null): string {
  if (!v) return '';
  const t = v.trim();
  return (t.length > 1 && t[0] === '"' && t[t.length - 1] === '"')
    ? t.slice(1, -1) : t;
}

let configured = false;
function ensureConfig(): void {
  if (configured) return;
  const root = loBlocksRoot();
  if (!root) throw new Error('records: cannot find the lo-blocks root');
  const read = (f: string) => {
    const p = resolve(root, 'config', f);
    return existsSync(p) ? readFileSync(p, 'utf-8') : '';
  };
  // system.pmss then local.pmss -- NOT server.pmss, which may carry provider
  // details irrelevant here, matching loadContentBuildConfig's reasoning.
  initConfig([read('system.pmss'), read('local.pmss')].filter(Boolean).join('\n'),
             { types: ['build'], classes: ['build'] });
  configured = true;
}

/**
 * The archive location for a namespace.
 *
 * THE COURSE WINS IF IT DECLARES ONE. A course that keeps its records somewhere
 * of its own says so in its rubric, exactly as it declares its other roots; the
 * setting is the default that makes a fresh clone work and the one line to edit
 * when the whole project moves provider.
 */
export function remoteFor(ns: string, declared?: RemoteSpec | null): RemoteSpec | null {
  // THE OPERATOR WINS OVER BOTH. $ARCHIVE_REMOTE redirects this install wherever
  // it is told, whatever the course or the setting say: it is how a run points
  // at a test archive, and how someone recovers when the configured location is
  // wrong in a way that stops them editing the configuration.
  const env = (process.env.ARCHIVE_REMOTE || '').trim();
  if (env) return { path: `${env.replace(/\/+$/, '')}/${ns}`,
                    folderId: (process.env.ARCHIVE_ROOT_FOLDER_ID || '').trim() || null };
  if (declared?.path) return declared;
  ensureConfig();
  const base = unquote(resolveConfig({}, 'archive-remote'));
  if (!base) return null;
  const folderId = unquote(resolveConfig({}, 'archive-root-folder-id'));
  return { path: `${base.replace(/\/+$/, '')}/${ns}`, folderId: folderId || null };
}

/** The rclone arguments that address this remote. Never call rclone without them. */
export function rcloneArgs(spec: RemoteSpec): string[] {
  return spec.folderId ? ['--drive-root-folder-id', spec.folderId] : [];
}

/** --transfers 32 is the measured knee; see the plan. 64 was four times worse. */
export const TRANSFERS = ['--transfers', '32', '--checkers', '32'];

/** Pins the revision. ASSERTED, NOT VERIFIABLE: see `pinningIsUnverified`. */
export const PIN = ['--drive-keep-revision-forever'];

/**
 * WE CANNOT CONFIRM THE PIN FROM HERE, and this constant exists so nobody
 * assumes we can. Measured 2026-10-07: rclone advertises 0 revision commands and
 * `lsjson` returns only ID, IsDir, MimeType, ModTime, Name, Path, Size -- no
 * keepForever. The flag is accepted and the upload succeeds; whether Drive
 * actually pinned the revision needs the Drive API to answer. An earlier note
 * calling this "measured" is not reproducible with rclone.
 */
export const pinningIsUnverified =
  'pinning is asserted by --drive-keep-revision-forever and cannot be verified '
  + 'through rclone; confirm once against the Drive API';

/**
 * 10s is far past a healthy probe and still fails fast when the remote is down.
 *
 * THE HISTORY MATTERS, because the number looked unjustifiable for a while. On
 * rclone's SHARED client_id this probe measured 820ms, 18.8s, 2.9s and a 20s
 * timeout on consecutive calls against a healthy remote -- 25x spread, one
 * failure in five. That is contention for a quota shared with every rclone user
 * who never made their own, and it made a reachability check unusable at any
 * timeout: tight meant random refusals, generous meant random 20s pauses.
 *
 * On a DEDICATED client_id, measured the same way: 432, 399, 516, 392, 397,
 * 445ms. Six for six, 1.3x spread. The fix was the credential, not the code.
 */
const PROBE_TIMEOUT_MS = 10_000;

let liveness: { at: number; ok: boolean; why: string } | null = null;
/** Cached for a minute: a probe costs 600-1100ms and editguard asks per write. */
const LIVENESS_TTL_MS = 60_000;

export function reachable(spec: RemoteSpec, now = Date.now()): { ok: boolean; why: string } {
  if (liveness && now - liveness.at < LIVENESS_TTL_MS) return liveness;
  let ok = false, why = '';
  try {
    // STDIO MUST BE FULLY PIPED. Measured 2026-10-07, same command three ways:
    //   ['ignore','ignore','pipe']  TIMED OUT at 20s -- rclone blocks
    //   ['ignore','pipe','pipe']    ok, but 9s
    //   'pipe'                      ok, 817ms, matching the shell
    // Ignoring a stream makes rclone stall, so a healthy remote reads as dead
    // and the editguard gate refuses every write. Found because the probe
    // disagreed with the identical command run by hand.
    // THE REMOTE ROOT, NOT THE COURSE FOLDER. Liveness is "can I reach the
    // service", and those are different questions: on a FIRST BUILD the course
    // folder does not exist yet, and probing it reported `ok=false` on a
    // perfectly healthy remote. `ensureCourseDir` is what answers the other
    // question, and it CREATES rather than complains.
    execFileSync('rclone', ['lsd', remoteRoot(spec), ...rcloneArgs(spec)],
                 { stdio: 'pipe', timeout: PROBE_TIMEOUT_MS });
    ok = true;
  } catch (e: any) {
    why = String(e?.stderr || e?.message || e).split('\n').filter(
      (l: string) => !/NOTICE/.test(l)).join(' ').slice(0, 200);
  }
  liveness = { at: now, ok, why };
  return liveness;
}

/** `coursedata:` from `coursedata:a/b/c` -- the service, not a path in it. */
export function remoteRoot(spec: RemoteSpec): string {
  const i = spec.path.indexOf(':');
  return i < 0 ? spec.path : spec.path.slice(0, i + 1);
}

/**
 * Make a course's archive folder if it is not there yet. -> true if it existed.
 *
 * THE FIRST BUILD OF A COURSE HAS NOWHERE TO PUT ANYTHING, which is not an
 * error and must not be reported as one. rclone creates parents on write, so
 * this exists mainly to answer the question honestly and to fail loudly if the
 * remote refuses -- a snapshot that silently invents its destination would hide
 * a misconfigured root until the day someone needed a restore.
 */
export function ensureCourseDir(spec: RemoteSpec): boolean {
  try {
    execFileSync('rclone', ['lsd', spec.path, ...rcloneArgs(spec)],
                 { stdio: 'pipe', timeout: PROBE_TIMEOUT_MS });
    return true;
  } catch { /* not there yet */ }
  execFileSync('rclone', ['mkdir', spec.path, ...rcloneArgs(spec)],
               { stdio: 'pipe', timeout: PROBE_TIMEOUT_MS });
  return false;
}

/** Forget the cached answer -- for tests, and after a config change. */
export function forgetLiveness(): void { liveness = null; }
