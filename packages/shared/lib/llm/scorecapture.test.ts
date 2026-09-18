// SCORE RECORDED RESPONSES WITH THE APP'S OWN SCORER, so the audit can ask
// whether the two engines READ a raw response the same way.
//
// The audit already compares the two engines' requests (promptcapture.test.ts)
// and their arithmetic over verdicts both happened to produce
// (scoring_logic_agreement). Between those sits a layer nothing tested: taking
// one raw response and turning it into checks and a score. A difference there --
// a verdict read from the wrong field, a blank operand treated as failing on one
// side and unknown on the other -- would show up as a rate difference and be
// read as the model, because the prompts are identical and the verdicts are
// never compared as INPUTS.
//
// So: every recorded response is scored here by `scoreSlotSheet` and, on the
// python side, by agreement.py, and the two are compared. It spends no tokens
// and touches no endpoint -- the responses are already on disk.
//
//   RUN_SCORE_CAPTURE=1 SCORE_IN=... SCORE_OUT=... \
//   npx vitest run packages/shared/lib/llm/scorecapture.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { scoreSlotSheet } from '@/lib/llm/slotSheet';

describe('score capture', () => {
  it('scores every recorded response with the app scorer', () => {
    if (process.env.RUN_SCORE_CAPTURE !== '1') return;
    const inp = JSON.parse(readFileSync(process.env.SCORE_IN!, 'utf8'));
    const sheets: Record<string, any> = inp.sheets;
    const out: Record<string, any> = {};
    for (const p of inp.payloads) {
      const sh = sheets[p.item];
      if (!sh) { out[p.id] = { error: 'no sheet for item' }; continue; }
      try {
        // `p.max` is the sheet's EXPLICIT max, carried from the record. Omitting
        // it makes scoreSlotSheet sum the slot points instead, which on Q4b is 6
        // against a published 5 -- a scale error that reads as 642 scoring
        // disagreements and is entirely the caller's.
        const r = scoreSlotSheet(sh.slots, p.checks, p.max, sh.cover, sh.equals,
                                 sh.onlyif, sh.counts, sh.expect, sh.requires,
                                 sh.forbid, sh.maps);
        out[p.id] = r ? { score: r.score, max: r.max, failed: r.failed.slice().sort() }
                      : { error: 'scoreSlotSheet returned null' };
      } catch (e: any) {
        out[p.id] = { error: String(e?.message ?? e).slice(0, 200) };
      }
    }
    writeFileSync(process.env.SCORE_OUT!, JSON.stringify(out));
    expect(Object.keys(out).length).toBe(inp.payloads.length);
  });
});
