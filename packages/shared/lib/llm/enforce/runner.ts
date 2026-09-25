// The one entry point python calls. `lo_enforce.py` is its only caller.
//
// Reads `{"check": <name>, "payload": ...}` or `{"probe": <name>, "payload": ...}`
// on stdin and writes `{"findings": [...]}`, `{"result": ...}` or
// `{"error": "..."}` on stdout. Stdin rather than argv because a payload can
// carry every shipped prompt in the corpus, or the whole reference corpus, and
// a check that silently truncates its input reports clean for the wrong reason.

import { PROBES, RULES } from './index';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

/** One request answered. Never throws: a batch must not lose its other members. */
function answer(req: { check?: string; probe?: string; payload?: unknown }) {
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
  try {
    const got = fn(req.payload);
    return kind === 'probe' ? { result: got } : { findings: got };
  } catch (e) {
    return { error: `${name} threw: ${String(e)}` };
  }
}

async function main() {
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
