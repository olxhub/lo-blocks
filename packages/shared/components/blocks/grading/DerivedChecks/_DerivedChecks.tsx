'use client';

import { useEffect, useMemo } from 'react';
import { useAggregate, componentFieldByStateKey, updateField, useFieldSelector } from '@/lib/state';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { parseSlots, parseDerived, publishedSheet, DEFAULT_VERDICTS } from '@/lib/llm/slotSheet';
import { verdictFor } from '@/lib/llm/derivedVerdicts';
import { DisplayError } from '@/lib/util/debug';
import { fields } from './DerivedChecks';

/**
 * Watch the declared fields, publish the sheet, render nothing.
 *
 * The write is guarded on the serialised payload. Without that, an effect that
 * writes state on every render re-renders and writes again — the storm
 * CompactPopout documents. Here the payload is a pure function of the watched
 * fields, so comparing it is both the correctness guard and the change detector.
 */
export default function _DerivedChecks(props: any) {
  const slotsAttr: string = props.slots ?? '';
  const derivedAttr: string = props.derived ?? '';

  const defaults = useMemo(
    () => (props.verdicts
      ? String(props.verdicts).split(',').map((v: string) => v.trim()).filter(Boolean)
      : DEFAULT_VERDICTS),
    [props.verdicts]
  );
  const slots = useMemo(() => parseSlots(slotsAttr, defaults), [slotsAttr, defaults]);
  const rules = useMemo(() => parseDerived(derivedAttr), [derivedAttr]);

  // Every watched field, flattened into one subscription and sliced back per
  // rule afterwards. One useAggregate keeps hook order fixed regardless of how
  // many rules an author writes.
  const refs = useMemo(() => rules.flatMap(r => r.targets), [rules]);
  const refsKey = refs.join('|');
  const stateKeys = useMemo(
    () => refs.map(ref => stateKeyForGlobalRef(ref as any, props.runtime.ns)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refsKey, props.runtime.ns]
  );

  // useAggregate asserts on a field descriptor, so there must be at least one
  // target. An author error, not a student state — surfaced as a no-op rather
  // than a crash that takes the page down.
  const valueField = stateKeys.length
    ? componentFieldByStateKey(props, stateKeys[0], 'value')
    : null;
  const texts = useAggregate(props, valueField as any, stateKeys, { fallback: '' });

  const payload = useMemo(() => {
    if (!stateKeys.length) return null;
    const checks: Record<string, { verdict: string; evidence: string }> = {};
    let at = 0;
    for (const r of rules) {
      const mine = r.targets.map(() => String(texts[at++] ?? ''));
      checks[r.key] = verdictFor(r, mine);
    }
    // Same builder as LLMAction, so the two writers of this field cannot drift.
    // showChecks is false because this block renders nothing: its checks are
    // never on screen, and a reader should not have to know which block wrote
    // the sheet to know whether the student saw it.
    return publishedSheet({
      slots, verdicts: checks, showChecks: false, max: props.max,
    });
  }, [rules, texts, slots, props.max, stateKeys.length]);

  const serialised = payload ? JSON.stringify(payload) : '';
  const checksField = fields.checks;
  const current = useFieldSelector(props, checksField);

  useEffect(() => {
    if (!serialised || String(current ?? '') === serialised) return;
    updateField(props, checksField, serialised);
    // `current` is intentionally in the dependency list: it is what makes this
    // settle after one write instead of firing on every render.
  }, [serialised, current, props, checksField]);

  // Every SCORED check needs a rule. Without one it has no verdict and would
  // score as unmet — a silent misgrade from a typo'd key or a rule dropped for
  // naming an unknown kind. Reported where an author will see it.
  const ruled = new Set(rules.map(r => r.key));
  const unruled = slots.filter(s => typeof s.pts === 'number' && !ruled.has(s.key));
  if (unruled.length) {
    return (
      <DisplayError
        props={props}
        title="DerivedChecks"
        message={`no derived rule for scored check(s): ${unruled.map(s => s.key).join(', ')}`}
      />
    );
  }
  return null;
}
