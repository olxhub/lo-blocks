// @vitest-environment jsdom
// Drives real blocks over a list of jobs, and writes what they produced.
//
// This is the seam an analysis harness uses instead of reimplementing the app.
// For each job it renders the actual screen, seeds the fields as a student would
// have filled them, clicks the actual button, and reports what the real
// LLMAction and grader wrote. No prompt, schema, provider call or scoring rule
// lives here — those are all in the blocks.
//
//   JOBS_JSON=jobs.json RESULTS_JSON=out.json IDMAP_JSON=idmap.json \
//   RUN_LLM_RUNNER=1 npx vitest run packages/shared/lib/llm/runner.test.ts
//
// A job:
//   { "cell": "p1/Q6",              // opaque label, echoed back
//     "screen": "psych/bmod_h1_q6", // block to render
//     "ns": "psych",
//     "button": "check my answer",  // accessible name; OMIT for a derived item
//     "feedback": "bmod_h1_q6_feedback",
//     "grader": "bmod_h1_q6_grader",
//     "fixture": { "bmod_h1_q4a_first": "..." } }
//
// An item whose every verdict is derived from the student's fields has no call to
// make and no button to press: DerivedChecks publishes its sheet from an effect as
// soon as the fields are seeded. Such a job omits `button`, and this waits for the
// sheet to appear instead of gating on an LLM status that will never change.
//
// A result adds: status, feedback, slots (with their point values), verdicts,
// grader (the block's own output), and sheet_max. Absolute scores are left to
// the caller: the grader reports a fraction, and multiplying it by the sheet's
// total is arithmetic on what the app published, not a scoring rule.

import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { readFileSync, writeFileSync } from 'fs';

import { store } from '@/lib/state/store';
import { settings } from '@/lib/state/settings';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { hasSettled, isReady, shouldRetry, backoffMs } from '@/lib/llm/runnerGuards';
// The grader's OWN satisfaction decision and its OWN mapped verdict, so a
// recorded computed verdict is the one that was scored rather than a
// reimplementation of the rules that would drift from it.
import { satisfiedMap, mappedVerdict } from '@/lib/llm/slotSheet';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import RenderOLX from '@/components/common/RenderOLX';
import { initConfig } from '@/lib/config';

// Rendering a real block reads config, and config is no longer implicitly
// initialised — see demoRenderHarness.ts, which does the same at module level.
// Without this every job fails with "Config not initialized" and the harness
// reports zero scored cells, which reads as a content problem rather than a
// setup one.
initConfig('* { allow-unsafe-content: true; }', { classes: ['client', 'test'] });

const ENABLED = process.env.RUN_LLM_RUNNER === '1';
const SERVER = process.env.LO_SERVER || 'http://localhost:8888';
const JOBS = process.env.JOBS_JSON;
const RESULTS = process.env.RESULTS_JSON;
const IDMAP = process.env.IDMAP_JSON;

type Job = {
  cell: string; screen: string; ns: string; button?: string;
  feedback: string; grader?: string; fixture: Record<string, string>;
};

/** jsdom resolves a relative fetch against its own origin; point it at the dev
 *  server. A transport detail — the request itself is the app's. */
function routeFetchToServer() {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) =>
    typeof input === 'string' && input.startsWith('/')
      ? real(SERVER + input, init)
      : real(input, init)) as typeof fetch;
}

describe.skipIf(!ENABLED)('blocks over a job list', () => {
  let jobs: Job[] = [];
  let reduxStore: any;

  beforeAll(() => {
    routeFetchToServer();
    jobs = JSON.parse(readFileSync(JOBS!, 'utf-8'));

    // ONE store for the whole run, deliberately.
    //
    // store.init() per cell looked cleaner but broke: lo_event binds to the
    // first store it is given, so from the second cell onward the app's writes
    // landed in an orphaned store while the runner polled a fresh one. The
    // status never changed and the cell timed out — which looked like provider
    // latency and was not.
    //
    // `extraFields: settings` is required, not optional: without it a
    // system-scoped write is dropped silently and application_state never
    // exists, leaving RenderOLX waiting on a locale forever.
    reduxStore = store.init({
      blockRegistry: BLOCK_REGISTRY,
      websocket: false,
      extraFields: settings,
    });
    const idMap = JSON.parse(readFileSync(IDMAP!, 'utf-8')).idMap;
    reduxStore.dispatch({
      redux_type: 'EMIT_EVENT', type: 'lo_event',
      payload: JSON.stringify({ event: 'LOAD_OLXJSON', source: 'content', blocks: idMap }),
    });
  });

  it('runs every job and writes the results', async () => {
    const results: any[] = [];

    for (const job of jobs) {
      // Seed the fields. Shape is the app's own captured event shape: the key
      // is `id` (a namespaced state key) and `scope` must be declared.
      for (const [id, value] of Object.entries(job.fixture)) {
        reduxStore.dispatch({
          redux_type: 'EMIT_EVENT', type: 'lo_event',
          payload: JSON.stringify({
            event: 'UPDATE_VALUE', scope: 'component',
            id: `${job.ns}/${id}`, value,
          }),
        });
      }

      const comp = () => reduxStore.getState().application_state?.component ?? {};
      const keyFor = (frag: string) => Object.keys(comp()).find(k => k.includes(frag));
      const status = () => {
        const k = keyFor(job.feedback);
        return k ? comp()[k]?.state : undefined;
      };
      // Gate on STATUS, never on text: LLMAction writes its error into the same
      // `value` field as its feedback, so a truthy value is not success. See
      // runnerGuards for why both the current and the pre-click status matter.
      // Kept at PARITY with the CLI harness, which is the whole point of this
      // runner: molly_scoring/scorer/agreement.py calls complete(retries=6),
      // i.e. `range(retries + 1)` = 7 attempts, with 429 backoff
      // min(2**attempt * 5 + 2, 45) — up to ~173s of waiting.
      //
      // This was 3, giving ~15s (backoffMs 5s + 10s). Provider failures here
      // arrive in 429 bursts, so the less patient side loses cells the other
      // side rides out — and a lost cell is EXCLUDED from the web's rate while
      // the same participant still scores on the CLI. The two columns of the
      // head-to-head were then computed over different denominators, which is
      // an infrastructural difference reported as a scoring one.
      //
      // 7 attempts here means waits of 5+10+20+40+40+40 = 155s, matching the
      // CLI's budget. If you change either number, change both.
      const MAX_ATTEMPTS = 7;
      let error: string | undefined;
      let attempts = 0;
      let derived = false;

      try {
        await act(async () => {
          render(
            React.createElement(
              Provider, { store: reduxStore } as any,
              React.createElement(RenderOLX as any, { id: job.screen, ns: job.ns }),
            ),
          );
          await new Promise(r => setTimeout(r, 300));
        });

        const sheet = () => {
          const k = keyFor(job.feedback);
          return k ? comp()[k]?.checks : undefined;
        };

        if (!job.button) {
          // Derived item: nothing to click, nothing to wait on but the effect
          // that publishes the sheet once the seeded fields have landed.
          attempts = 1;
          await act(async () => {
            for (let i = 0; i < 100 && !sheet(); i++) {
              await new Promise(r => setTimeout(r, 50));
            }
          });
          if (!sheet()) error = 'no derived sheet was published';
          derived = true;
        } else {

        const button = await screen.findByRole(
          'button', { name: new RegExp(job.button, 'i') }, { timeout: 20_000 },
        );

        for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
          const fbKeyNow = keyFor(job.feedback);
          if (fbKeyNow) {
            // Clear any previous terminal status so `before` is unambiguous and
            // a genuine result cannot be mistaken for a stale one.
            reduxStore.dispatch({
              redux_type: 'EMIT_EVENT', type: 'lo_event',
              payload: JSON.stringify({
                event: 'UPDATE_STATE', scope: 'component',
                id: fbKeyNow, state: LLM_STATUS.INIT, value: LLM_STATUS.INIT,
              }),
            });
          }
          const before = status();

          // Click and wait inside ONE act scope: the response resolves long
          // after the click and every update it triggers lands then.
          await act(async () => {
            fireEvent.click(button);
            for (let i = 0; i < 300 && !hasSettled(status(), before); i++) {
              await new Promise(r => setTimeout(r, 1000));
            }
          });

          if (!hasSettled(status(), before)) {
            error = `did not settle within 300s (status=${String(status())})`;
            break;
          }
          if (isReady(status())) { error = undefined; break; }

          // Terminal failure. The reason is in the feedback field, where
          // LLMAction writes it — surface it rather than reporting a bare
          // status, which says nothing about why the provider refused.
          const k = keyFor(job.feedback);
          const detail = k ? String(comp()[k]?.value ?? '') : '';
          error = `attempt ${attempts}: ${detail.slice(0, 300) || 'ERROR with no detail'}`;

          if (!shouldRetry(status(), attempts, MAX_ATTEMPTS)) break;
          const wait = backoffMs(attempts);
          // eslint-disable-next-line no-console
          console.log(`[runner] ${job.cell}: ${error} — retrying in ${wait / 1000}s`);
          await act(async () => { await new Promise(r => setTimeout(r, wait)); });
        }

        }
      } catch (e: any) {
        error = String(e?.message ?? e).slice(0, 300);
      }

      const fbKey = keyFor(job.feedback);
      const fb = fbKey ? comp()[fbKey] : undefined;
      let slots: any[] = [];
      let verdicts: Record<string, any> = {};
      let sheet: any = {};
      let explicitMax: number | undefined;
      if (fb?.checks) {
        try {
          const parsed = JSON.parse(String(fb.checks));
          slots = parsed.slots ?? [];
          verdicts = parsed.verdicts ?? {};
          sheet = parsed;            // the RULES, for the computed families
          explicitMax = typeof parsed.max === 'number' ? parsed.max : undefined;
        } catch { /* leave empty; the caller sees no sheet */ }
      }
      // A COMPUTED check is never asked, so `verdicts[key]` is absent and this
      // file recorded null for it -- while the grader scored a verdict and the
      // student read one. That made a computed slot invisible in the artifact and
      // silently incomparable with the harness, which records the same slot.
      //
      // Filled from the grader's own decision, and in the SLOT'S OWN VOCABULARY
      // rather than as a display phrase: `verdicts` holds met/absent/wrong_kind
      // everywhere else, and `computedVerdict` answers 'matches'/'not reported',
      // which no other consumer of this column could read. `maps` goes through
      // `mappedVerdict` instead of satisfaction because it is the one family with
      // more than two outcomes -- an empty box and a wrong one are both failures
      // and must stay distinguishable.
      const sat = satisfiedMap(
        slots, verdicts, sheet.cover ?? [], sheet.equals ?? [], sheet.counts ?? [],
        sheet.expect ?? [], sheet.requires ?? [], sheet.forbid ?? [], sheet.maps ?? [],
      );
      const computedFor = (key: string): string | undefined => {
        const m = (sheet.maps ?? []).find((r: any) => r.key === key);
        if (m) return mappedVerdict(m, verdicts);
        const rule = [...(sheet.equals ?? []), ...(sheet.expect ?? []),
                      ...(sheet.forbid ?? [])].find((r: any) => r.key === key);
        if (!rule) return undefined;
        const opts = slots.find((s: any) => s.key === key)?.options ?? ['met', 'absent'];
        return sat[key] ? opts[0] : ((rule as any).fails ?? opts[1] ?? 'no');
      };
      const gKey = job.grader ? keyFor(job.grader) : undefined;

      results.push({
        cell: job.cell,
        // A derived item has no LLM status to report and none to gate on: the
        // sheet either published or it did not.
        status: derived ? 'derived' : (status() ?? 'no-cell'),
        ok: derived ? !error : (isReady(status()) && !error),
        attempts,
        error,
        feedback: fb?.value ?? '',
        slots: slots.map((s: any) => ({ key: s.key, pts: s.pts, gates: s.gates })),
        // What the model answered for each slot. A judgement fills `verdict`, a
        // count fills `count`; reading only `verdict` reported null for every
        // count, and the per-slot rates this file exists to make countable went
        // blind on them.
        verdicts: Object.fromEntries(
          slots.map((s: any) => [
            s.key,
            verdicts[s.key]?.verdict ?? verdicts[s.key]?.count
              ?? computedFor(s.key) ?? null,
          ]),
        ),
        // `refers_to` is its OWN column rather than a fallback: a cover member
        // answers both fields, so folding it into `verdicts` would always lose
        // to the verdict and the reference would be unobservable — which is
        // exactly what happened the first time this was collapsed.
        refers_to: Object.fromEntries(
          slots.map((s: any) => [s.key, verdicts[s.key]?.refers_to ?? null]),
        ),
        // The evidence is why a slot got its verdict, and a slot sheet exists to
        // make that inspectable. Dropping it meant a failing cell could only be
        // diagnosed from the prose, which is not always specific.
        evidence: Object.fromEntries(
          slots.map((s: any) => [s.key, verdicts[s.key]?.evidence ?? null]),
        ),
        // The EFFECTIVE total. On a deduction-based sheet the costs deliberately
        // do not sum to the item, so summing them would understate it — H2's
        // four-point examples would come back as two.
        sheet_max: explicitMax
          ?? slots.reduce((n: number, s: any) => n + (typeof s.pts === 'number' ? s.pts : 0), 0),
        grader: gKey ? comp()[gKey] : null,
      });

      cleanup();
      // Written after EVERY cell, not once at the end. The caller scores each
      // cell as it lands and reports it against gold, which it cannot do if the
      // file only appears when the whole pass is over — and a pass is ~12
      // minutes, so that meant no visible result for twelve minutes at a time.
      // The last write is the complete set, so the final read is unchanged.
      writeFileSync(RESULTS!, JSON.stringify(results, null, 2));
      // eslint-disable-next-line no-console
      console.log(`[runner] ${job.cell}: ${results[results.length - 1].ok ? 'ok' : 'FAILED'}`);
    }

    writeFileSync(RESULTS!, JSON.stringify(results, null, 2));
    expect(results.length).toBe(jobs.length);
  }, 3_600_000);
});
