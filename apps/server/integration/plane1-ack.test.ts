// @vitest-environment node
// apps/server/integration/plane1-ack.test.ts
//
// Plane-1 (client→server) ack protocol — the reliability fix
// (pubsub-state-sync-design §3a "Wire contract" and §7 "reliability bug").
//
// Boots the REAL server in-process (so the actual server.ts hello send and
// the actual pipeline.ts durable-append+ack path are exercised) and drives
// it with a raw `ws` client that speaks exactly what lo_event's
// websocketLogger parses:
//
//   - first frame is  { status: 'hello', capabilities: { ack: true } }
//     (only `ack`; NOT `subscribe` — Plane 2 isn't built);
//   - a seq-tagged event is acked cumulatively as { status: 'ack', seq },
//     and ONLY after it is durably present in the events/ log (ordering:
//     log-write-then-ack, never ack-then-write);
//   - a simulated shutdown flushes/finalizes the log so an in-flight event
//     survives teardown.
//
// The full "kill-the-tab" browser e2e (headless browser + linked client)
// is a separate follow-up; this validates the server half of the contract.

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
});

afterAll(async () => {
  try { handle?.server.close(); } catch { /* ignore */ }
  process.env.PORT = savedEnv.PORT;
  process.env.NODE_ENV = savedEnv.NODE_ENV;
});

// --- helpers ----------------------------------------------------------------

async function waitFor(pred: () => boolean | Promise<boolean>, timeout = 15000, interval = 20) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('waitFor timed out');
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
 *  make every appended-so-far event independently decodable. */
function readLogTolerant(logPath: string): Promise<any[]> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const g = zlib.createGunzip();
    const done = () => resolve(
      Buffer.concat(chunks).toString().trim().split('\n')
        .filter(Boolean).map(l => JSON.parse(l)),
    );
    g.on('data', d => chunks.push(d as Buffer));
    g.on('error', done);   // truncated trailer on a live stream — use what we have
    g.on('end', done);
    g.end(fs.readFileSync(logPath));
  });
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

test('first frame is a hello advertising ack (and not subscribe)', async () => {
  const { ws, frames, opened } = openClient();
  await opened;
  await waitFor(() => frames.length >= 1);

  // The capability handshake must be the FIRST frame on the connection.
  expect(frames[0].status).toBe('hello');
  expect(frames[0].capabilities).toEqual({ ack: true });
  // Plane 2 is not built — must NOT be advertised.
  expect(frames[0].capabilities.subscribe).toBeUndefined();

  ws.close();
}, 20000);

test('events are acked cumulatively, and only after they are on disk', async () => {
  const known = knownPaths();
  const { ws, frames, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor(() => (conn = newConn(known)!) !== undefined);

  // id/field-less telemetry events: the ack contract (durable-append-then-ack)
  // is decided in decodeAndLog, upstream of field routing, so these exercise
  // it fully while keeping the test hermetic (a field-addressed event would
  // send the reducer stage into content sync — irrelevant to Plane 1).
  const send = (seq: number) => ws.send(JSON.stringify({
    event: 'TELEMETRY', kind: 'click', ts: seq, seq,
  }));
  send(1); send(2); send(3);

  const acks = () => frames.filter(f => f.status === 'ack').map(f => f.seq);
  await waitFor(() => acks().includes(3));

  // Cumulative + monotonic: acks never go backwards, and cover through 3.
  const seqs = acks();
  expect(Math.max(...seqs)).toBeGreaterThanOrEqual(3);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

  // Durability-before-ack: by the time ack(3) reached the client, all three
  // events are already in the events/ log. appendEventDurable resolves only
  // after the flushed bytes hit the file, and the ack is sent after that — so
  // observing the ack guarantees the on-disk write happened first.
  const logged = (await readLogTolerant(conn.path))
    .filter(e => typeof e.seq === 'number').map(e => e.seq);
  expect(logged).toEqual(expect.arrayContaining([1, 2, 3]));

  ws.close();
}, 20000);

test('legacy (seq-less) events are logged but never acked', async () => {
  const known = knownPaths();
  const { ws, frames, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor(() => (conn = newConn(known)!) !== undefined);

  // An ack-less client (lo_event 0.0.7) tags no seq. The event must still be
  // captured, but the server must not emit an ack for it.
  ws.send(JSON.stringify({ event: 'TELEMETRY', value: 'legacy', ts: 1 }));
  await waitFor(async () => (await readLogTolerant(conn.path)).some(e => e.value === 'legacy'));

  await new Promise(r => setTimeout(r, 100));  // give any (wrong) ack time to arrive
  expect(frames.filter(f => f.status === 'ack')).toHaveLength(0);

  ws.close();
}, 20000);

test('simulated shutdown finalizes the log and preserves in-flight events', async () => {
  const known = knownPaths();
  const { ws, opened } = openClient();
  await opened;
  let conn!: NonNullable<ReturnType<typeof newConn>>;
  await waitFor(() => (conn = newConn(known)!) !== undefined);

  ws.send(JSON.stringify({
    event: 'FINAL_ACTION', value: 'last', ts: 99, seq: 99,
  }));
  // The final action lands durably in the append log.
  await waitFor(async () => (await readLogTolerant(conn.path)).some(e => e.seq === 99));

  // Simulate the process shutdown path (index.ts shutdown handler): close
  // every active socket and wait for each pipeline to drain and
  // saveConnectionLog() to finalize its log. This is the same machinery a
  // SIGTERM/SIGINT triggers.
  for (const sock of handle.activeConnections.keys()) sock.close();
  await waitFor(() => handle.activeConnections.size === 0);

  // A STRICT gunzip now succeeds (the trailer was written on finalize) and
  // the in-flight final event survived teardown — not lost in a JS variable.
  const events = readLogStrict(conn.path);
  expect(events.some(e => e.seq === 99 && e.event === 'FINAL_ACTION')).toBe(true);
}, 20000);
