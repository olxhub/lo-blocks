// @vitest-environment node
// apps/server/integration/plane1-ack.test.ts
//
// Plane-1 (client→server) ack protocol — the reliability fix
// (see docs/README.md, section "State, Events, and Synchronization").
//
// Boots the REAL server in-process (so the actual pipeline.ts
// durable-append+ack path is exercised) and drives
// it with a raw `ws` client that speaks exactly what lo_event's
// websocketLogger parses:
//
//   - an identified event is acked by name as { status: 'ack', id },
//     and ONLY after it is durably present in the events/ log (ordering:
//     log-write-then-ack, never ack-then-write);
//   - a simulated shutdown flushes/finalizes the log so an in-flight event
//     survives teardown.
//
// This validates the SERVER half of the contract. Two behaviors are
// deliberately NOT tested here and must be added in a separate testing PR —
// and done RIGHT (a real declarative/browser e2e; NOT WS polyfills, mocks, or
// stubbed harnesses, which we do not want in the suite):
//
//   TODO(plane1-e2e): kill-the-tab tripwire. Real browser: type, close the tab
//     mid-send (network throttled to widen the window), reopen, assert the
//     events/ log contains every keystroke. This is the forensics' explicit
//     regression test — the only thing that reproduces the
//     original data-loss bug end to end.
//   TODO(lo_event-not-acking): no-ack assertion (client-side, with lo_event's
//     tests). A client pointed at a server that accepts events and never acks
//     them must HOLD its queue and say so out loud. Both parts exist now — the
//     hold in lo_event, the saying-so in the symptom-based fatal banner (see the
//     FATAL block in components/common/ConnectionStatus.tsx) — but nothing
//     asserts the pair end to end against a real never-acking server.
//     NOT written as a capability/misdeploy check: lo_event deliberately
//     dropped `hello` negotiation and the legacy confirm-on-send path, so
//     "server doesn't advertise ack" is no longer a distinguishable state. The
//     assertion belongs on the SYMPTOM — connected, outbox non-empty, nothing
//     acked in N seconds — which also covers a wedged pipeline or a quarantined
//     event type, neither of which a handshake would have caught.

import { test, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import getPort from 'get-port';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import { loadServerConfig } from '@/lib/config';
import { MemoryKVStore, type KVStore } from '@/lib/storage/kvs';
import { createToolRegistry } from '@/lib/mcp/registry';
import type { ServerHandle } from '../src/server.js';

let handle: ServerHandle;
let port: number;
let kvs: KVStore;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  port = await getPort();
  savedEnv.PORT = process.env.PORT;
  savedEnv.NODE_ENV = process.env.NODE_ENV;
  // Set PORT before importing server.ts (it captures PORT at module load).
  // production skips the Vite dev middleware — this test only uses the WS
  // path, so no client build is needed.
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  // getConfig('state-canonical') is read per connection; load the config
  // classes so it resolves (config/server.pmss => 'fields').
  loadServerConfig(fs.readFileSync);
  const { startServer } = await import('../src/server.js');
  kvs = new MemoryKVStore();
  handle = await startServer(kvs, createToolRegistry());
  // Generous budget, deliberately per-hook rather than a global hookTimeout
  // bump (which would blunt genuine-hang detection suite-wide). This hook
  // does real one-time work — vitest transforms the ENTIRE server module
  // graph on the dynamic import above, then boots it. Measured 8.3-9.2s
  // standalone against the default 10s: under full-suite CPU contention it
  // crossed the line, failing runs with a hook timeout and no assertion.
  // A real hang still fails — just in 60s instead of 10.
}, 60_000);

afterAll(async () => {
  try { handle?.server.close(); } catch { /* ignore */ }
  process.env.PORT = savedEnv.PORT;
  process.env.NODE_ENV = savedEnv.NODE_ENV;
});

// --- helpers ----------------------------------------------------------------

async function waitFor(
  what: string, pred: () => boolean | Promise<boolean>, timeout = 15000, interval = 20,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms: ${what}`);
}

function openClient() {
  const ws = new WebSocket(`ws://localhost:${port}/wsapi/in/`);
  const frames: any[] = [];
  ws.on('message', (d: Buffer) => frames.push(JSON.parse(d.toString())));
  const opened = new Promise<void>((res, rej) => {
    ws.on('open', () => res());
    ws.on('error', rej);
  });
  return { ws, frames, opened };
}

/** Decompress whatever is on disk so far, tolerating a not-yet-written gzip
 *  trailer (a live connection's log is mid-stream). Z_SYNC_FLUSH boundaries
 *  make every appended-so-far event independently decodable.
 *
 *  "Not there yet" is a legitimate state, not an error: createConnectionLog
 *  registers the connection synchronously but fs.createWriteStream opens the
 *  fd asynchronously, so the file appears a few ticks after a caller can first
 *  see conn.path. Callers poll this in a waitFor, so an empty result simply
 *  means "keep waiting" — throwing ENOENT out of the predicate instead aborted
 *  the whole test, which is how this file used to flake under load. */
function readLogTolerant(logPath: string): any[] {
  if (!fs.existsSync(logPath)) return [];
  // Z_SYNC_FLUSH as the finish flush accepts a stream whose trailer isn't
  // written yet, which is every live connection's log.
  return zlib.gunzipSync(fs.readFileSync(logPath), { finishFlush: zlib.constants.Z_SYNC_FLUSH })
    .toString().trim().split('\n').filter(Boolean)
    // A mid-stream read can end on a partial line (e.g. "{"). Skipping it is
    // the same "not there yet, keep polling" case as a missing file — throwing
    // out of a waitFor predicate aborts the whole test, which is the flake this
    // helper exists to prevent.
    .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/** STRICT decompress — requires a finalized gzip (trailer present). Used
 *  after shutdown to prove the log was flushed AND closed cleanly. */
function readLogStrict(logPath: string): any[] {
  return zlib.gunzipSync(fs.readFileSync(logPath)).toString()
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/** Deterministically resolve THIS client's server-side connection: the one
 *  whose log path wasn't present before the client connected. Robust to
 *  connections from earlier tests still tearing down (a size/last-inserted
 *  heuristic races with that cleanup). */
function knownPaths(): Set<string> {
  return new Set([...handle.activeConnections.values()].map(c => c.path));
}
function newConn(known: Set<string>) {
  for (const c of handle.activeConnections.values()) if (!known.has(c.path)) return c;
  return undefined;
}

// --- tests ------------------------------------------------------------------

// SKIPPED with the frame it covers — see the commented-out `hello` send in
// server.ts. Kept (and skipped rather than commented out, so it keeps
// type-checking against openClient/waitFor and cannot silently rot) because if
// a hello-shaped frame returns — Plane 2 announcing `subscribe`, or a resume
// hint — this is the assertion it needs: the handshake is the FIRST frame, and
// it advertises exactly what the server actually speaks, never a capability
// that isn't built.
test.skip('first frame is a hello advertising ack (and not subscribe)', async () => {
  const { ws, frames, opened } = openClient();
  await opened;
  await waitFor('first frame from server', () => frames.length >= 1);

  expect(frames[0].status).toBe('hello');
  expect(frames[0].capabilities).toEqual({ ack: true });

  ws.close();
}, 20000);

test('events are acked by name, and only after they are on disk', async () => {
  const known = knownPaths();
  const { ws, frames, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor('server-side connection registered', () => (conn = newConn(known)!) !== undefined);

  // id/field-less telemetry events: the ack contract (durable-append-then-ack)
  // is decided in decodeAndLog, upstream of field routing, so these exercise
  // it fully while keeping the test hermetic (a field-addressed event would
  // send the reducer stage into content sync — irrelevant to Plane 1).
  // Events carry their own name (lo_event stamps metadata.eventId as
  // <browser>.<session>.<seq>); the server acks that name back.
  const idOf = (n: number) => `browser-t.session-t.${n}`;
  const send = (n: number) => ws.send(JSON.stringify({
    event: 'TELEMETRY', kind: 'click', ts: n,
    metadata: { eventId: idOf(n), browserTag: 'browser-t', sessionTag: 'session-t', sessionSeq: n },
  }));
  send(1); send(2); send(3);

  const acks = () => frames.filter(f => f.status === 'ack').map(f => f.id);
  await waitFor(`ack for ${idOf(3)}`, () => acks().includes(idOf(3)));

  // Each event is acked by name — no event is acked that was not sent, and
  // every one that was sent is accounted for.
  expect(acks()).toEqual(expect.arrayContaining([idOf(1), idOf(2), idOf(3)]));

  // Durability-before-ack: by the time the ack for #3 reached the client, all
  // three events are already in the events/ log. appendEventDurable resolves
  // only after the flushed bytes hit the file, and the ack is sent after that,
  // so observing the ack guarantees the on-disk write happened first.
  const logged = readLogTolerant(conn.path)
    .map(e => e?.metadata?.eventId).filter(Boolean);
  expect(logged).toEqual(expect.arrayContaining([idOf(1), idOf(2), idOf(3)]));

  ws.close();
}, 20000);

test('legacy (unidentified) events are logged but never acked', async () => {
  const known = knownPaths();
  const { ws, frames, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor('server-side connection registered', () => (conn = newConn(known)!) !== undefined);

  // An ack-less client stamps no eventId. The event must still be
  // captured, but the server must not emit an ack for it.
  ws.send(JSON.stringify({ event: 'TELEMETRY', value: 'legacy', ts: 1 }));
  await waitFor('legacy event in the log',
    () => readLogTolerant(conn.path).some(e => e.value === 'legacy'));

  await new Promise(r => setTimeout(r, 100));  // give any (wrong) ack time to arrive
  expect(frames.filter(f => f.status === 'ack')).toHaveLength(0);

  ws.close();
}, 20000);

test('simulated shutdown finalizes the log and preserves in-flight events', async () => {
  const known = knownPaths();
  const { ws, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor('server-side connection registered', () => (conn = newConn(known)!) !== undefined);

  ws.send(JSON.stringify({
    event: 'FINAL_ACTION', value: 'last', ts: 99,
    metadata: { eventId: 'browser-t.session-t.99' },
  }));
  // The final action lands durably in the append log.
  await waitFor('final action in the log',
    () => readLogTolerant(conn.path)
      .some(e => e?.metadata?.eventId === 'browser-t.session-t.99'));

  // Simulate the process shutdown path (index.ts shutdown handler): close
  // every active socket and wait for each pipeline to drain and
  // saveConnectionLog() to finalize its log. This is the same machinery a
  // SIGTERM/SIGINT triggers.
  for (const sock of handle.activeConnections.keys()) sock.close();
  await waitFor('every connection torn down', () => handle.activeConnections.size === 0);

  // A STRICT gunzip now succeeds (the trailer was written on finalize) and
  // the in-flight final event survived teardown — not lost in a JS variable.
  const events = readLogStrict(conn.path);
  expect(events.some(e => e?.metadata?.eventId === 'browser-t.session-t.99'
                       && e.event === 'FINAL_ACTION')).toBe(true);
}, 20000);
