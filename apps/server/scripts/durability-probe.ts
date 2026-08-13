// apps/server/scripts/durability-probe.ts
//
// A measuring instrument for the Plane-1 durability promise. NOT part of the
// test suite — run it by hand when thinking about this problem:
//
//     npx tsx apps/server/scripts/durability-probe.ts [rounds]
//
// THE QUESTION IT ANSWERS
// -----------------------
// At the instant appendEventDurable() resolves — which is the instant
// pipeline.ts sends the ack — is the event actually in the file?
//
// "Ack" is allowed to mean "written, not fsynced". It is NOT allowed to mean
// "sitting in a JS buffer", which is precisely the data-loss window Plane 1
// exists to close: the server says "safe, you may forget it", the client
// deletes its durable copy, and the process dies before the bytes land.
//
// WHY IT IS A SCRIPT AND NOT A TEST
// ---------------------------------
// It measures a RACE against an fs open/write, so a single round proves
// nothing and a pass/fail line hides the interesting number. What is worth
// knowing is the RATE, and how it moves when the flush strategy changes —
// which is a thing to sit and look at, not a thing to gate CI on. It is also
// why the integration test cannot cover this: by the time an ack has crossed a
// real socket, the write has usually landed on its own.
//
// WHAT IT MEASURED
// ----------------
// Resolving on the zlib flush alone (i.e. awaiting zlib but not the fd write):
//   ~28% of rounds had a ZERO-BYTE log file at ack, and occasionally the file
//   did not exist at all, because fs.createWriteStream opens the fd
//   asynchronously. Losses came in scattered bursts rather than clustered at
//   startup, so a small round count would have missed it.
// Awaiting the file write as well: 0 missing, 0 empty.
//
// KEEP THIS AROUND while the flush strategy is still open. The batching rework
// (see TODO(plane1-durability) in ../src/eventLog.ts) changes exactly what this
// measures, and "did the rate stay zero?" is the question to ask of it.

import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import { createConnectionLog, appendEventDurable, saveConnectionLog } from '../src/eventLog.js';
import type { ConnectionLog } from '../src/eventLog.js';
import type { AuthUser } from '../src/auth.js';

const USER = {
  user_id: 'DurabilityProbe', provenance: 'guest',
  safe_user_id: 'guest-DurabilityProbe', authorized: false,
} as AuthUser;

/** Decompress a log that is still mid-stream (no gzip trailer yet).
 *  Z_SYNC_FLUSH as the finish flush is what makes that legal. */
function readSoFar(logPath: string): string {
  return zlib.gunzipSync(fs.readFileSync(logPath), {
    finishFlush: zlib.constants.Z_SYNC_FLUSH,
  }).toString();
}

async function main() {
  const rounds = Number(process.argv[2] ?? 300);
  const conns: ConnectionLog[] = [];
  let missing = 0;   // file not created at all
  let empty = 0;     // file exists, this event's bytes are not in it

  console.log(`Probing ${rounds} rounds: is the event in the file when the ack fires?`);
  try {
    for (let i = 0; i < rounds; i++) {
      const conn = createConnectionLog(USER);
      conns.push(conn);
      await appendEventDurable(conn, { event: 'TELEMETRY', kind: 'click', probe: i });

      // No polling, no grace period: the resolved promise IS the claim.
      if (!fs.existsSync(conn.path)) missing++;
      else if (!readSoFar(conn.path).includes(`"probe":${i}`)) empty++;
    }
  } finally {
    for (const conn of conns) {
      await saveConnectionLog(conn).catch(() => { /* cleanup only */ });
      try { fs.unlinkSync(conn.path); } catch { /* already gone */ }
    }
  }

  const bad = missing + empty;
  const pct = ((bad / rounds) * 100).toFixed(1);
  console.log(`  file never created : ${missing}`);
  console.log(`  bytes not yet there: ${empty}`);
  console.log(`  FALSE ACKS         : ${bad}/${rounds} (${pct}%)`);
  console.log(bad === 0
    ? '\nThe ack means what it says.'
    : `\nThe ack is a lie ${pct}% of the time — it fired before the bytes landed.`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(2); });
