// The one entry point python calls. `lo_enforce.py` is its only caller.
//
// Reads `{"check": <name>, "payload": ...}` or `{"probe": <name>, "payload": ...}`
// on stdin and writes `{"findings": [...]}`, `{"result": ...}` or
// `{"error": "..."}` on stdout. Stdin rather than argv because a payload can
// carry every shipped prompt in the corpus, or the whole reference corpus, and
// a check that silently truncates its input reports clean for the wrong reason.

import { mountedCourses } from './courseData';
import { PROBES, RULES } from './index';
import { NATIVE, SELF_ASSEMBLING } from './native';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

// RULES WHOSE NATIVE ASSEMBLER IS PROVEN TO BUILD PYTHON'S PAYLOAD.
//
// SELF_ASSEMBLING NOW LIVES IN `native.ts`, beside the assemblers it is a
// claim about, and is re-exported here because callers have imported it from
// this module since it was written. It moved so that `assemblerFor()` -- the
// one gate the runner and the BUILD AUDIT both consult -- could see both the
// allowlist and the assembler table without an import cycle.
export { SELF_ASSEMBLING };

/** One request answered. Never throws: a batch must not lose its other members. */
function answer(req: {
  check?: string; probe?: string; payload?: unknown; ns?: string;
}) {
  const kind = req.probe ? 'probe' : 'check';
  const name = String(req.probe ?? req.check);
  const fn = kind === 'probe' ? PROBES[name] : RULES[name];
  if (!fn) {
    const offered = kind === 'probe' ? Object.keys(PROBES) : Object.keys(RULES);
    return {
      error: `no ${kind} named ${JSON.stringify(name)}; this package offers ` +
             `${JSON.stringify(offered.sort())}`,
    };
  }
  let payload = req.payload;
  // NO PAYLOAD MEANS "ASSEMBLE IT YOURSELF", which is what lets a caller --
  // python or otherwise -- ask for a rule without knowing how to feed it.
  if (kind === 'check' && (payload === undefined || payload === null)) {
    if (!SELF_ASSEMBLING.has(name)) {
      return {
        error: `${name} was asked with no payload and is not in ` +
               `SELF_ASSEMBLING: its native assembler has not been shown to ` +
               `build the payload python builds, so assembling here would feed ` +
               `the rule different data and it would agree for the wrong reason`,
      };
    }
    const asm = NATIVE[name];
    if (!asm) {
      return { error: `${name} is in SELF_ASSEMBLING and has no assembler in NATIVE` };
    }
    const ns = req.ns ?? soleMountedCourse();
    if (!ns) {
      return {
        error: `${name} was asked with no payload and no course: name one with ` +
               `"ns", or mount exactly one course so it can be inferred`,
      };
    }
    try {
      payload = asm(ns);
    } catch (e) {
      return { error: `${name}'s assembler threw: ${String(e)}` };
    }
  }
  try {
    const got = fn(payload);
    return kind === 'probe' ? { result: got } : { findings: got };
  } catch (e) {
    return { error: `${name} threw: ${String(e)}` };
  }
}

/** The one mounted course, or null when there is not exactly one. */
function soleMountedCourse(): string | null {
  const all = mountedCourses();
  return all.length === 1 ? all[0] : null;
}

/**
 * SERVE MODE: one process, a request per line, for as long as the caller wants.
 *
 * WHY IT EXISTS. Starting tsx costs ~1.6s and the audit asks one rule at a
 * time, so every rule goal K ports added that much to EVERY audit -- and the
 * selftest runs the whole audit once per injection case, so the cost is
 * multiplied by nineteen. Measured 2026-09-25 at eighteen ported checks: ~9
 * minutes of the selftest was process startup, and the run was killed by a
 * ceiling set before the ports existed. A goal that makes the audit's own
 * verification unaffordable is defeating itself.
 *
 * `batch` already paid the cost once per BATCH, but the audit cannot batch: each
 * check is a separate python function that the audit calls on its own. Serve
 * mode pays it once per PROCESS instead, and needs no caller to change shape.
 *
 * NEWLINE-DELIMITED, one answer per request, in order. Answers never throw --
 * `answer` already guarantees that -- so a bad request cannot end the session
 * and strand the requests behind it.
 */
async function serve() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req: { check?: string; probe?: string; payload?: unknown; batch?: any[] };
      try {
        req = JSON.parse(line);
      } catch (e) {
        process.stdout.write(JSON.stringify({ error: `unreadable request: ${String(e)}` }) + '\n');
        continue;
      }
      const out = Array.isArray(req.batch)
        ? { batch: req.batch.map(answer) }
        : answer(req);
      process.stdout.write(JSON.stringify(out) + '\n');
    }
  }
}

async function main() {
  if (process.argv.includes('--serve')) {
    await serve();
    return;
  }
  let req: { check?: string; probe?: string; payload?: unknown; batch?: any[] };
  try {
    req = JSON.parse(await readStdin());
  } catch (e) {
    console.log(JSON.stringify({ error: `unreadable request: ${String(e)}` }));
    return;
  }
  // ONE PROCESS, MANY QUESTIONS. Starting tsx costs ~1.4s and the audit calls
  // one rule at a time, so every rule K ports adds that much to every audit.
  // A batch pays it once. Each member is answered independently and in order --
  // a rule that throws must not cost the batch its other answers.
  if (Array.isArray(req.batch)) {
    console.log(JSON.stringify({ batch: req.batch.map(answer) }));
    return;
  }
  // NAMED, NOT GUESSED. An unknown name is a wiring fault in the python caller;
  // answering it with an empty finding list would report the check as passing
  // when it never ran at all.
  console.log(JSON.stringify(answer(req)));
}

void main();
