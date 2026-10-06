'use client';

import { useMemo } from 'react';
import { componentFieldByStateKey, useAggregate } from '@/lib/state';
// `getBlockByDefinitionRef`, renamed upstream by #294 ("Rename kid block ids to
// definition keys"). Same signature and same return, so the swap is mechanical
// -- but the ARGUMENT's meaning moved with it: what this passes is now read as a
// definition ref rather than a raw OLX id.
import { getBlockByDefinitionRef } from '@/lib/blocks';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import {
  parseSlots, parseCover, parseEquals, parseOnlyIf, parseCounts,
  scoreSlotSheet, DEFAULT_VERDICTS,
} from '@/lib/llm/slotSheet';

/** One authored row: which block declares the sheet, and what to call it. */
export function parseItems(spec: string): { id: string; label: string }[] {
  return (spec ?? '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const i = entry.indexOf(':');
      return i < 0
        ? { id: entry.trim(), label: entry.trim() }
        : { id: entry.slice(0, i).trim(), label: entry.slice(i + 1).trim() };
    })
    .filter(r => r.id);
}

/**
 * Read an item\'s declared sheet off the AUTHORING block\'s attributes.
 *
 * The maximum has to come from here rather than from the published sheet,
 * because a sheet only exists once the student has pressed the button. Reading
 * the total from it made the denominator grow as they worked: a barely-started
 * Handout 2 read "0 points out of 4", the 4 being the two DerivedChecks sheets
 * that publish themselves on mount, while ten real items showed nothing at all.
 *
 * Parsed with the same functions LLMAction parses its own attributes with, so a
 * sheet cannot be worth one thing to the grader and another to this table.
 */
export function declaredSheet(attrs: any) {
  const slotsAttr = String(attrs?.slots ?? '');
  if (!slotsAttr.trim()) return null;
  const defaults = attrs?.verdicts
    ? String(attrs.verdicts).split(',').map((v: string) => v.trim()).filter(Boolean)
    : DEFAULT_VERDICTS;
  // `free` rides ON the slots, so every consumer of this sheet --
  // scoring here, and publishedSheet for whatever re-scores it later --
  // carries the forgiven verdicts without another parameter.
  const slots = parseSlots(slotsAttr, defaults, attrs?.free ? String(attrs.free) : undefined);
  const maxAttr = attrs?.max;
  const explicit = maxAttr !== undefined && maxAttr !== null && String(maxAttr) !== ''
    ? Number(maxAttr) : undefined;
  const scored = slots.filter(s => typeof s.pts === 'number');
  if (!scored.length && explicit === undefined) return null;    // not a graded item
  return {
    slots,
    max: explicit ?? scored.reduce((n, s) => n + (s.pts as number), 0),
    explicitMax: explicit,
    cover: parseCover(attrs?.cover),
    equals: parseEquals(attrs?.equals),
    onlyif: parseOnlyIf(attrs?.onlyif),
    counts: parseCounts(attrs?.counts),
  };
}

/** Points earned, or null when the student has not produced a sheet yet. */
export function scoreOf(raw: unknown, declared: ReturnType<typeof declaredSheet>) {
  if (!raw || !declared) return null;
  try {
    const p = JSON.parse(String(raw));
    if (!p || !Array.isArray(p.slots)) return null;
    // THE LAST THREE WERE MISSING, so this table could show a score the grader
    // did not give: `requires`, `forbid` and `maps` all defaulted to `[]` here
    // while the grader applied them. A student reading a total that disagrees
    // with their mark has no way to tell which one is wrong.
    const r = scoreSlotSheet(p.slots, p.verdicts ?? {}, p.max, p.cover ?? [],
                             p.equals ?? [], p.onlyif ?? [], p.counts ?? [],
                             p.expect ?? [], p.requires ?? [], p.forbid ?? [],
                             p.maps ?? []);
    return r ? r.score : null;
  } catch {
    return null;
  }
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export default function _ScoreTable(props: any) {
  const rows = useMemo(() => parseItems(props.items ?? ''), [props.items]);

  // The authoring block for each row, read from loaded content rather than from
  // the DOM: Sequential renders one screen at a time, so nothing this table
  // describes is mounted while the table itself is.
  const declared = useMemo(
    () => rows.map(r => declaredSheet(getBlockByDefinitionRef(props as any, r.id as any)?.attributes)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.map(r => r.id).join('|'), props.runtime.ns],
  );

  // Where each row\'s filled sheet lives: an LLMAction publishes to its target,
  // a DerivedChecks carries its own.
  const sheetIds = useMemo(
    () => rows.map((r, i) => {
      const a = getBlockByDefinitionRef(props as any, r.id as any)?.attributes as any;
      const t = a?.target;
      return String((Array.isArray(t) ? t[0] : t) ?? r.id);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.map(r => r.id).join('|'), props.runtime.ns],
  );

  const stateKeys = useMemo(
    () => sheetIds.map(id => stateKeyForGlobalRef(id as any, props.runtime.ns)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetIds.join('|'), props.runtime.ns],
  );

  const checksField = stateKeys.length
    ? componentFieldByStateKey(props, stateKeys[0], 'checks')
    : null;
  const sheets = useAggregate(props, checksField as any, stateKeys, { fallback: '' });

  const scored = rows.map((r, i) => ({
    ...r,
    max: declared[i]?.max ?? null,
    score: scoreOf(sheets[i], declared[i]),
  }));
  const totalScore = scored.reduce((n, r) => n + (r.score ?? 0), 0);
  const totalMax = scored.reduce((n, r) => n + (r.max ?? 0), 0);

  if (!rows.length) return null;

  return (
    <div className="my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-subtle text-left">
            <th className="py-1 pr-4 font-semibold">{props.heading ?? 'Question'}</th>
            <th className="py-1 pr-4 font-semibold text-right">Points scored</th>
            <th className="py-1 font-semibold text-right">Points available</th>
          </tr>
        </thead>
        <tbody>
          {scored.map(r => (
            <tr key={r.id} className="border-b border-subtle/50">
              <td className="py-1 pr-4">{r.label}</td>
              <td className="py-1 pr-4 text-right">{r.score === null ? '\u2014' : fmt(r.score)}</td>
              <td className="py-1 text-right">{r.max === null ? '\u2014' : fmt(r.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 font-semibold">
        A total of {fmt(totalScore)} points out of {fmt(totalMax)}.
      </p>
    </div>
  );
}
