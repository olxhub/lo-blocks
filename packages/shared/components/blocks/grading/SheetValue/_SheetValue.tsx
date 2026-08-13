'use client';

import { useEffect, useMemo } from 'react';
import { componentFieldByStateKey, updateField, useFieldSelector } from '@/lib/state';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { fields } from './SheetValue';

/** Drop one layer of surrounding quotation marks, straight or curly. */
export function unquote(s: string): string {
  const t = s.trim();
  const pairs: [string, string][] = [['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’']];
  for (const [open, close] of pairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

/**
 * Pull one check's value out of a published sheet.
 *
 * Returns '' for every shape of "not there" — no sheet yet, unparseable, no such
 * check, that part empty — because the caller's fallback handles all of them the
 * same way and distinguishing them here would only let one leak to a student.
 */
export function readSheetValue(raw: unknown, check: string, part: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(String(raw));
    const entry = parsed?.verdicts?.[check];
    const v = entry?.[part];
    return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v));
  } catch {
    return '';
  }
}

/**
 * Watch the sheet, expose one value, render nothing.
 *
 * Guarded write, for the reason _DerivedChecks documents: an effect that writes
 * on every render re-renders and writes again. The value here is a pure function
 * of the sheet and the fallback, so comparing it is both the guard and the
 * change detector.
 */
export default function _SheetValue(props: any) {
  const check: string = props.check ?? '';
  const part: string = props.part ?? 'evidence';
  const strip = String(props.strip ?? 'true') !== 'false';

  const targetKey = useMemo(
    () => (props.target
      ? stateKeyForGlobalRef(
          Array.isArray(props.target) ? props.target[0] : props.target, props.runtime.ns)
      : null),
    [props.target, props.runtime.ns],
  );
  const fallbackKey = useMemo(
    () => (props.fallback
      ? stateKeyForGlobalRef(
          Array.isArray(props.fallback) ? props.fallback[0] : props.fallback, props.runtime.ns)
      : null),
    [props.fallback, props.runtime.ns],
  );

  // Hooks must not be conditional, so both reads are unconditional and a missing
  // ref reads its own field instead — harmless, and never written back.
  const checksField = componentFieldByStateKey(props, targetKey ?? props.stateKey, 'checks');
  const rawChecks = useFieldSelector(props, checksField, { stateKey: targetKey ?? undefined });

  const fbField = componentFieldByStateKey(props, fallbackKey ?? props.stateKey, 'value');
  const rawFallback = useFieldSelector(props, fbField, { stateKey: fallbackKey ?? undefined });

  const value = useMemo(() => {
    const fromSheet = targetKey ? readSheetValue(rawChecks, check, part) : '';
    const chosen = fromSheet || (fallbackKey ? String(rawFallback ?? '') : '');
    return strip ? unquote(chosen) : chosen.trim();
  }, [rawChecks, rawFallback, check, part, strip, targetKey, fallbackKey]);

  const own = useFieldSelector(props, fields.value);
  useEffect(() => {
    if (String(own ?? '') === value) return;
    updateField(props, fields.value, value);
    // `own` is intentionally a dependency: it is what makes this settle after
    // one write instead of firing on every render.
  }, [value, own, props]);

  return null;
}
