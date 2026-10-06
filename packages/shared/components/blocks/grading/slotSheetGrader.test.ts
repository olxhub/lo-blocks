// What the grader does with a sheet, and what it refuses to do.
//
// `gradeSlotSheet` is not exported, so this covers the reachable surface:
// `sheetFromJson`, the reader that turns a stored sheet back into a payload. The
// CALL SITE -- which of the eleven arguments it forwards to scoreSlotSheet -- is
// still untested, and that is the defect that actually happened: `maps` was the
// eleventh argument and was not passed, so no mapped check was ever computed.
// See scoring/BACKLOG.md; closing it needs `gradeSlotSheet` exported.
import { describe, it, expect } from 'vitest';
import { sheetFromJson } from './SlotSheetGrader';
import { publishedSheet, parseSlots, parseMaps, parseExpect, scoreSlotSheet } from '@/lib/llm/slotSheet';

const SLOTS = parseSlots('a:First@1|b:Second@1|pick:Which kind:pick(kinds)|m:Mapped@2',
                         ['met', 'absent']);
const MAPS = parseMaps('m:pick:good~met,bad~absent,*~unclear');

describe('sheetFromJson', () => {
  it('reads a published sheet back with every rule family named', () => {
    const sheet = publishedSheet({ slots: SLOTS, verdicts: {}, showChecks: true, maps: MAPS });
    const back = sheetFromJson(JSON.stringify(sheet))!;
    expect(back).toBeTruthy();
    // Each family is DEFAULTED explicitly rather than left to the spread, because
    // `expect` was once carried by the spread, went missing, and cost four items
    // two points on every ungated cell.
    for (const k of ['cover', 'equals', 'onlyif', 'counts', 'expect', 'forbid', 'maps'] as const) {
      expect(Array.isArray((back as any)[k]), `${k} should default to an array`).toBe(true);
    }
    expect(back.maps).toEqual(MAPS);
  });

  it('defaults a family the sheet never carried, rather than leaving it undefined', () => {
    const sheet = publishedSheet({ slots: SLOTS, verdicts: {}, showChecks: false });
    const back = sheetFromJson(JSON.stringify(sheet))!;
    expect(back.expect).toEqual([]);
    expect(back.maps).toEqual([]);
  });

  it('refuses anything that is not a sheet, rather than half-reading it', () => {
    expect(sheetFromJson('not json')).toBeNull();
    expect(sheetFromJson(JSON.stringify({ verdicts: {} }))).toBeNull();  // no slots
    expect(sheetFromJson(JSON.stringify(null))).toBeNull();
    expect(sheetFromJson(undefined)).toBeNull();
  });

  it('keeps the slots verbatim, so what rides ON a slot survives', () => {
    // `free` is carried on the slot, not in a rule list. A reader that rebuilt
    // slots field by field would drop it and a forgiven verdict would start
    // costing its points.
    const freed = parseSlots('u:Stated?:met/absent/unclear@2', ['met', 'absent'], 'u:unclear');
    const sheet = publishedSheet({ slots: freed, verdicts: {}, showChecks: false });
    const back = sheetFromJson(JSON.stringify(sheet))!;
    expect(back.slots.find((s: any) => s.key === 'u')?.free).toEqual(['unclear']);
  });

  it('a round-tripped sheet scores identically to the rules in hand', () => {
    const checks = { a: { verdict: 'met' }, b: { verdict: 'absent' },
                     pick: { refers_to: 'bad' } };
    const sheet = publishedSheet({ slots: SLOTS, verdicts: checks, showChecks: false, maps: MAPS });
    const back = sheetFromJson(JSON.stringify(sheet))!;
    const direct = scoreSlotSheet(SLOTS, checks as any, undefined, [], [], [], [], [], [], [], MAPS);
    const viaSheet = scoreSlotSheet(back.slots, checks as any, back.max as any,
                                    back.cover, back.equals, back.onlyif, back.counts,
                                    back.expect, back.requires, back.forbid, back.maps);
    expect(viaSheet!.score).toBe(direct!.score);
    // `bad` maps to `absent`, so the mapped check is charged: 1 of 4.
    expect(viaSheet!.score).toBe(1);
  });
});
