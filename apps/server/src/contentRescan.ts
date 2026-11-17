// apps/server/src/contentRescan.ts
//
// How often the running server may re-scan content sources.
//
// The websocket event path derives routing from content — a field's level,
// its grouping partition, which views aggregate it — so every field write
// consults indexes built from a content scan, and a scan re-stats and
// re-reads every content file in every mounted source (~80ms across the
// fall-pilot repos). Whether that is allowed to happen while the server
// runs is a deployment fact, not a constant, so it is a PMSS setting:
// `content-rescan-ms` in config/server.pmss, which carries the reasoning
// for its per-environment defaults.
//
// Dev defaults to 2000ms (content is edited under a running server, and an
// edit must reach routing without a restart). Production defaults to 0 —
// off — because a deployed host serves a checkout that only a deploy
// updates, and a deploy restarts the server: a re-scan there can only find
// what the boot scan already found. Either default is overridable, so a dev
// can take the scans out of the event path and an operator with a writable
// content mount can turn them on.

import { resolveConfig } from '@/lib/config';

/** The configured interval in ms; 0 means scan at boot and never again. */
export function readContentRescanMs(): number {
  const raw = resolveConfig({}, 'content-rescan-ms');
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 0) {
    throw new Error(`content-rescan-ms must be a non-negative integer (ms), got: ${raw}`);
  }
  return ms;
}

/**
 * The same interval as a cache TTL for the routing indexes built from each
 * scan: re-deriving those maps from an idMap that cannot have changed is
 * work with no possible new answer. 0 becomes an INFINITE TTL — build once
 * from the boot scan and keep it. Passing 0 through would mean the
 * opposite to a TTL cache: every lookup is past its expiry, so every
 * lookup rebuilds.
 */
export function indexTtlFor(rescanMs: number): number {
  return rescanMs === 0 ? Number.POSITIVE_INFINITY : rescanMs;
}
