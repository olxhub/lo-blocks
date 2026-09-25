// The SHIPPED scorer, re-applied to answers that were already recorded.
//
// WHAT QUESTION THIS ANSWERS. When lo-blocks' scoring code changes, every
// recorded web column is stamped against the old code and the audit says so.
// The remedy used to be `measured.WEB_CODE_NEUTRAL`: a hand-kept table
// declaring a pair of shas score-neutral, PROVED by re-scoring every covered
// cell through agreement.py's python mirror of `scoreSlotSheet`. Goal O
// eliminated that mirror and the table retired with it.
//
// THIS IS NOT A SECOND SCORER. That distinction is the whole reason this file
// is allowed to exist: it imports `scoreSlotSheet` and calls it with the
// ELEVEN arguments `SlotSheetGrader` passes, in that order. Nothing here
// decides anything about scoring. If it drifted from the grader it would be a
// mirror again, which is what goal O existed to end — so the argument list is
// copied from the call site and must be kept level with it.
//
// A RE-SCORE IS DETERMINISTIC, WHICH IS THE POINT. A sweep cannot settle
// neutrality: one run is a draw, and Q3 has been seen at 16/20, 12/20 and
// 15/20 on identical code. Holding the model's ANSWERS fixed removes the model
// entirely, so what is left is arithmetic, and arithmetic either reproduces
// 6,268 cells or names the ones it does not.

import { scoreSlotSheet } from '../slotSheet';

/** The nine rule tables an item's `<LLMAction>` carries, as python reads them. */
export type Sheet = {
  slots: any[]; cover?: any[]; equals?: any[]; onlyif?: any[]; counts?: any[];
  expect?: any[]; requires?: any[]; forbid?: any[]; maps?: any[];
};

/** One recorded cell: what the model answered, and what it scored at the time. */
export type RecordedPayload = {
  id: string;
  item: string;
  /** {slotKey: {verdict|count, refers_to, evidence}} — computed keys excluded. */
  checks: Record<string, any>;
  /** The `sheet_max` the app was given, passed as `explicitMax`. */
  max: number;
  /** The POINTS recorded for this cell. */
  recorded: number;
};

export type RescoreRow = {
  id: string; item: string;
  recorded: number; rescored: number | null;
  same: boolean; why?: string;
};

export function scoreRecordedSheets(
  p: { sheets: Record<string, Sheet>; payloads: RecordedPayload[] },
): RescoreRow[] {
  const out: RescoreRow[] = [];
  for (const pay of p?.payloads ?? []) {
    const s = p.sheets?.[pay.item];
    if (!s) {
      // NEVER SILENTLY SKIPPED. A payload with no sheet is a cell this could
      // not re-score, and dropping it would shrink the denominator without
      // saying so — which is how a partial comparison reads as a clean one.
      out.push({ id: pay.id, item: pay.item, recorded: pay.recorded,
                 rescored: null, same: false, why: 'no sheet for this item' });
      continue;
    }
    let r: ReturnType<typeof scoreSlotSheet>;
    try {
      // THE GRADER'S OWN CALL, argument for argument. See SlotSheetGrader.ts:115.
      r = scoreSlotSheet(
        s.slots, pay.checks, pay.max, s.cover ?? [], s.equals ?? [],
        s.onlyif ?? [], s.counts ?? [], s.expect ?? [], s.requires ?? [],
        s.forbid ?? [], s.maps ?? []);
    } catch (e) {
      out.push({ id: pay.id, item: pay.item, recorded: pay.recorded,
                 rescored: null, same: false, why: `threw: ${String(e)}` });
      continue;
    }
    if (!r) {
      out.push({ id: pay.id, item: pay.item, recorded: pay.recorded,
                 rescored: null, same: false, why: 'sheet carries no points' });
      continue;
    }
    // NaN IS A REFUSAL, NOT A MATCH. On 2026-09-xx an options bag was passed
    // where `explicitMax` belonged; every score came back NaN, and
    // `Math.abs(NaN - x) > 1e-9` is FALSE, so every cell "matched" and the run
    // reported perfect agreement. A +0.5 control moved 286 cells instead of
    // 2,760 and that is the only reason it was caught. Finiteness is asserted
    // before any comparison is made.
    const got = r.score;
    if (!Number.isFinite(got) || !Number.isFinite(pay.recorded)) {
      out.push({ id: pay.id, item: pay.item, recorded: pay.recorded,
                 rescored: Number.isFinite(got) ? got : null, same: false,
                 why: `not a finite score (got ${String(got)}, recorded ${String(pay.recorded)})` });
      continue;
    }
    out.push({ id: pay.id, item: pay.item, recorded: pay.recorded,
               rescored: got, same: Math.abs(got - pay.recorded) < 1e-9 });
  }
  return out;
}
