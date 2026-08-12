// @vitest-environment node
// apps/server/src/eventLog.test.ts
//
// The two guarantees the hand-written pump in createConnectionLog exists to
// provide, tested directly rather than through the server:
//
//   - a file write that FAILS must turn an in-flight appendEventDurable into a
//     rejection (no false ack), and must do so from the write callback itself,
//     not by relying on when Node happens to emit 'error';
//   - an event LARGER than the file stream's highWaterMark must still be in the
//     file when appendEventDurable resolves — i.e. the pump must not pause gzip
//     on backpressure, which would resolve `conn.fileWritten` for an earlier
//     chunk while this event's bytes sat in zlib's readable buffer.
//
// Both are properties of the pump, so both go through the real
// createConnectionLog. The first replaces the file stream (via
// fs.createWriteStream) with one that fails every write; the second uses a real
// file and reads it back mid-stream.

import { test, expect, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as zlib from 'node:zlib';

// The pump lives inside createConnectionLog and closes over the stream
// fs.createWriteStream returned, so the only seam for a failing file stream is
// fs itself. Everything else passes through to the real module (eventLog.ts
// mkdirSync's events/ at import time, and the backpressure test below writes a
// real file), and the substitution is opt-in per test via `failingFileStream`.
let failingFileStream: any = null;
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: actual,
    createWriteStream: (...args: any[]) =>
      failingFileStream ?? (actual.createWriteStream as any)(...args),
  };
});
import { createConnectionLog, appendEventDurable, type ConnectionLog } from './eventLog.js';
import type { AuthUser } from './auth.js';
import type { SafeUserId } from '@/lib/types/identity';

const USER: AuthUser = {
  user_id: 'LogTester', provenance: 'guest',
  safe_user_id: 'guest-LogTester' as SafeUserId, authorized: false,
} as AuthUser;

/** Logs created by a test, removed afterwards so the events/ dir doesn't grow. */
const created: ConnectionLog[] = [];
afterEach(() => {
  failingFileStream = null;
  for (const conn of created.splice(0)) {
    try { conn.stream.destroy(); } catch { /* already gone */ }
    try { fs.rmSync(conn.path, { force: true }); } catch { /* never opened */ }
  }
});

/** Read the events written SO FAR out of a live (trailer-less) log.
 *  Z_SYNC_FLUSH as the finish flush is what makes a mid-stream gzip
 *  decodable — the same trick the plane1-ack integration test uses. */
function readLogSoFar(logPath: string): any[] {
  if (!fs.existsSync(logPath)) return [];
  return zlib.gunzipSync(fs.readFileSync(logPath), { finishFlush: zlib.constants.Z_SYNC_FLUSH })
    .toString().trim().split('\n').filter(Boolean)
    .flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
}

test('a failing file write rejects the durable append (write-callback capture, not the error event)', async () => {
  // A file stream that fails every write by calling the write callback with an
  // error and NEVER emitting 'error'. That isolates the guarantee to the pump's
  // own capture: eventLog.ts also has an 'error' listener that sets
  // conn.streamError, but it only wins the race with the promise chain because
  // Node currently emits stream errors on nextTick. Withholding the event here
  // means this test passes only if the write callback itself records the error.
  const fails: any = new EventEmitter();
  fails.write = (_chunk: Buffer, cb: (err?: Error) => void) => {
    cb(new Error('ENOSPC: no space left on device'));
    return false;
  };
  fails.end = () => {};
  failingFileStream = fails;

  const conn = createConnectionLog(USER);
  created.push(conn);
  expect(conn.fileStream).toBe(fails); // the mock really is in the pump

  await expect(appendEventDurable(conn, { event: 'TELEMETRY', kind: 'click' }))
    .rejects.toThrow(/ENOSPC/);
  // And the failure is remembered, so nothing acks on a later event either.
  expect(conn.streamError?.message).toMatch(/ENOSPC/);
  await expect(appendEventDurable(conn, { event: 'TELEMETRY', kind: 'click2' }))
    .rejects.toThrow(/ENOSPC/);
});

test('an event larger than the file stream highWaterMark is on disk when the append resolves', async () => {
  // End-to-end shape of the durability claim, against a REAL file: a payload
  // several times fs.WriteStream's 64KiB highWaterMark even after gzip, so the
  // pump's writes return false and the writable buffers. On resolution the
  // whole event must be recoverable from the bytes written so far — which also
  // pins the Z_SYNC_FLUSH (without it the bytes are still inside zlib and
  // nothing is decodable).
  //
  // This test does NOT by itself catch a reintroduced gzip.pause(): zlib runs
  // the flush on the threadpool, so by the time the flush callback fires the
  // queued file writes have usually completed anyway, whatever the pump did.
  // The deterministic version of that invariant is the next test.
  const conn = createConnectionLog(USER);
  created.push(conn);
  // Random-ish, so gzip cannot compress it back under the watermark.
  const payload = Array.from({ length: 40_000 }, (_, i) => `chunk-${i}-${(i * 2654435761) % 1e9}`).join(' ');
  expect(payload.length).toBeGreaterThan(500_000);

  await appendEventDurable(conn, {
    event: 'CONTENT_PARSED', metadata: { eventId: 'browser-t.session-t.1' }, payload,
  });

  // Resolution means "in the file", read with no further waiting: no polling,
  // no extra ticks — any need for those would BE the bug.
  const logged = readLogSoFar(conn.path);
  const parsed = logged.find(e => e.event === 'CONTENT_PARSED');
  expect(parsed).toBeDefined();
  expect(parsed.payload).toBe(payload);       // whole event, not a prefix
  expect(conn.log.eventCount).toBe(1);
});

test('durable append waits for EVERY backpressured chunk, not just the first', async () => {
  // The no-pause invariant, made deterministic. This file stream reports
  // backpressure on every write (returns false) and completes each write
  // callback a tick later, recording the chunk only THEN — so "what is in the
  // file" is exactly "what the writable has acknowledged", with the timing
  // pinned instead of left to the threadpool.
  //
  // The correct pump keeps handing chunks over and repoints conn.fileWritten at
  // the newest write, so awaiting it means every earlier chunk landed too. A
  // pump that instead paused gzip on `false` would leave the rest of this
  // event's compressed bytes in zlib's readable buffer while conn.fileWritten
  // still named an EARLY chunk — that promise resolves, appendEventDurable
  // resolves, and the server acks an event whose bytes were never written.
  // 'drain' is emitted once all writes settle, so a pause-based pump is not
  // wedged by this fake; it simply resolves too early, and the assertion below
  // is what catches it.
  const acknowledged: Buffer[] = [];
  const slow: any = new EventEmitter();
  let inFlight = 0;
  slow.write = (chunk: Buffer, cb: (err?: Error) => void) => {
    inFlight++;
    setTimeout(() => {
      acknowledged.push(Buffer.from(chunk));
      if (--inFlight === 0) slow.emit('drain');
      cb();
    }, 5);
    return false;                             // always "over the watermark"
  };
  slow.end = () => {};
  failingFileStream = slow;                   // same fs seam, different fake

  const conn = createConnectionLog(USER);
  created.push(conn);
  const payload = Array.from({ length: 40_000 }, (_, i) => `chunk-${i}-${(i * 2654435761) % 1e9}`).join(' ');

  await appendEventDurable(conn, {
    event: 'CONTENT_PARSED', metadata: { eventId: 'browser-t.session-t.1' }, payload,
  });

  // No waiting, no polling: at the moment of resolution, every compressed byte
  // of this event must already be acknowledged by the writable.
  const recovered = zlib.gunzipSync(Buffer.concat(acknowledged),
    { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString();
  const parsed = recovered.trim().split('\n').flatMap(l => {
    try { return [JSON.parse(l)]; } catch { return []; }
  }).find(e => e.event === 'CONTENT_PARSED');
  expect(parsed).toBeDefined();
  expect(parsed.payload).toBe(payload);
});
