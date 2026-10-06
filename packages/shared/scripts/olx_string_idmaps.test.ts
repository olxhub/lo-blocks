// @vitest-environment node
// packages/shared/scripts/olx_string_idmaps.test.ts
//
// The invariant this script exists to hold: THE IDS IT MINTS MATCH THE ONES THE
// RUNTIME MINTED. An OlxSlot renders OLX from a runtime-authored string, and the
// ids for that content are a PRODUCT OF THE PARSE (createId() hashes the parsed
// node), so they are reproducible only by the same parser, called the same way.
// A wrapper that drifts from _OlxSlot.tsx does not degrade -- it resolves
// nothing, silently, in every processed capture.
//
// Nothing inside lo-blocks calls this script (its consumer is the event-log
// pipeline's process_events.py), so without this file the coupling is held by
// comment alone. Two tests, because they fail for different reasons:
//   1. BEHAVIOUR -- the script's output equals a direct parseOLX call made the
//      way the runtime host makes it.
//   2. DRIFT -- the two call sites still pass the same provenance and provider.
//      Test 1 cannot see a change to _OlxSlot.tsx, because it computes its own
//      expectation; this one reads both sources.
import { test, expect, afterAll } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import { parseOLX } from '../lib/content/parseOLX';
import { toLofsRef } from '../lib/types/address';
import { parseContentNamespace } from '../lib/types/id-grammar';

// Invented content, deliberately: this file must not depend on any course being
// installed. Two unnamed children so the auto-assigned '<ns>/_<hash>' ids -- the
// ones a regex over the source can never predict -- are actually exercised.
const NS = 'demos';
const OLX =
  '<Sequential id="student_sequence">' +
  '<Markdown>First page</Markdown>' +
  '<Markdown>Second page</Markdown>' +
  '</Sequential>';

const TMP = (name: string) => path.resolve(`./tmp/olx-string-idmaps-${name}.json`);
const FILES = ['jobs', 'out', 'badjobs', 'badout'].map(TMP);

afterAll(async () => {
  for (const f of FILES) { try { await fs.unlink(f); } catch {} }
});

function runScript(args: string[]): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', 'packages/shared/scripts/olx_string_idmaps.ts', ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('exit', (exitCode) => resolve({ exitCode: exitCode ?? 1, stderr }));
  });
}

test('the ids it mints match a runtime-shaped parseOLX call', async () => {
  // The expectation: parseOLX called as OlxSlot/_OlxSlot.tsx calls it.
  const expected = await parseOLX(OLX, [toLofsRef('validate://')], undefined,
                                  parseContentNamespace(NS));
  expect(expected.root).toBeTruthy();
  expect(Object.keys(expected.idMap ?? {}).length).toBeGreaterThan(0);

  await fs.writeFile(TMP('jobs'), JSON.stringify({ only: { ns: NS, olx: OLX } }));
  const { exitCode, stderr } = await runScript(['--jobs', TMP('jobs'), '--out', TMP('out')]);
  expect(exitCode, `script failed: ${stderr}`).toBe(0);

  const got = JSON.parse(await fs.readFile(TMP('out'), 'utf8')).only;
  expect(got).toBeDefined();
  expect(got.root).toBe(expected.root);
  // The WHOLE map, not just its keys. Provenance rides in each entry's `source`,
  // and a changed lofs ref leaves the ids identical -- measured, by injecting one
  // -- so a key-set comparison would wave it through.
  expect(got.idMap).toEqual(JSON.parse(JSON.stringify(expected.idMap)));

  // And the minted ids really are the hashed kind, not just the authored one --
  // otherwise this would still pass with child id assignment broken entirely.
  const minted = Object.keys(got.idMap).filter((k) => k.startsWith(`${NS}/_`));
  expect(minted.length).toBe(2);
}, 120000);

test('an unparseable string is omitted, not emitted empty', async () => {
  await fs.writeFile(TMP('badjobs'), JSON.stringify({
    good: { ns: NS, olx: OLX },
    broken: { ns: NS, olx: '<Sequential><Markdown>unclosed' },
    badns: { ns: 'Not A Namespace', olx: OLX },
  }));
  const { exitCode } = await runScript(['--jobs', TMP('badjobs'), '--out', TMP('badout')]);
  expect(exitCode).toBe(0);

  // The caller's contract: a job with no maps simply finds none and falls back to
  // no resolution. An empty idMap emitted under the key would instead read as
  // "parsed, and the content has no ids".
  const out = JSON.parse(await fs.readFile(TMP('badout'), 'utf8'));
  expect(Object.keys(out)).toEqual(['good']);
}, 120000);

test('it parses the way the runtime host does, and has not drifted from it', async () => {
  const read = async (p: string) => fs.readFile(path.resolve(p), 'utf8');
  const host = await read('packages/shared/components/blocks/authoring/OlxSlot/_OlxSlot.tsx');
  const script = await read('packages/shared/scripts/olx_string_idmaps.ts');

  // Same provenance ref and the same (absent) content provider on both sides. If
  // either call gains a provider or changes its lofs ref, the ids stop matching
  // the ones in the event stream and every dynamic-OLX resolution goes quiet.
  const CALL = /parseOLX\(\s*[A-Za-z0-9_.]+\s*,\s*\[toLofsRef\('validate:\/\/'\)\]\s*,\s*undefined\s*,/;
  expect(host, '_OlxSlot.tsx no longer makes the call this script mirrors').toMatch(CALL);
  expect(script, 'the script no longer mirrors _OlxSlot.tsx').toMatch(CALL);
});
