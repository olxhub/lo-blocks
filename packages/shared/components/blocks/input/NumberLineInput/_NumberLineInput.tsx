// packages/shared/components/blocks/input/NumberLineInput/_NumberLineInput.tsx
//
// A native <input type="range"> plus a layer of content-labeled ticks.
//
// Native gets us role="slider", aria-valuemin/max/now, arrow/Home/End keys,
// touch dragging, and RTL mirroring for free; everything this file adds is
// the tick layer, the reference marker, and the value contract.
//
// No derived state: every render computes from props, the stored field, and
// the two expression attributes. A drag writes the field once per step it
// crosses — deliberately, so the whole interaction is in the event stream.
//
// Touching or focusing-and-keying the line at its resting position counts as
// choosing it: a learner who means the midpoint of a Likert clicks the thumb
// where it already sits, which moves nothing and fires no change event, so
// pointer-up and key-up commit the resting position while the answer is
// still unset.
//
// DISPLAY MODE (display="true") is the same line read backwards: it draws a
// position computed by initial= and takes none. There is no <input> in the
// tree at all — a disabled-and-hidden range would still be a control with a
// value in the a11y tree, and this is a picture, not a control, so the whole
// figure is one role="img" named by the position it shows. The track is ours
// here (the native range drew it in the other mode), the marker rides in the
// same __marks layer as the reference marker, and an absent position — the
// aggregate over items nobody has answered yet — draws no marker at all
// rather than parking one at the midpoint and calling it a score.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { createContext } from 'react';
import { useFieldSelector, updateField } from '@/lib/state';
import { useInputReadOnly } from '@/lib/player/inputInteraction';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';
import { useKids } from '@/lib/player/client/render';
import { useReferences } from '@/lib/stateLanguage/hooks';
import { extractAndMergeRefs } from '@/lib/stateLanguage/references';
import { evaluate, createContext as createEvalContext } from '@/lib/stateLanguage/evaluate';
import { getTicks, nearestTick } from './tickHelpers';

/** What a <Tick> needs from the line it sits on: where its value falls. */
export interface NumberLineInfo {
  min: number;
  max: number;
  /** Percentage along the track, for `inset-inline-start`. */
  percentOf: (value: number) => number;
}

// null when a Tick is rendered outside any number line — it renders a
// DisplayError in that case rather than guessing a position.
export const NumberLineContext = createContext<NumberLineInfo | null>(null);

/** A number, or null when the expression is absent/unevaluable. */
function evaluateNumber(expr: { ast: any } | undefined, context: any): number | null {
  if (!expr) return null;
  try {
    const value = Number(evaluate(expr.ast, context));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * A mark riding on the line at `percent`, with an optional label under it.
 *
 * Two callers, identical structure, different class prefix: `reference` is
 * the fixed "where you are now" bar, `marker` is display mode's computed
 * position. Keeping them one component is what keeps them one layout.
 */
function Mark(
  { kind, percent, label }: { kind: 'reference' | 'marker'; percent: number; label?: string }
) {
  return (
    <span className={`lo-numberline__${kind}`} style={{ insetInlineStart: `${percent}%` }}>
      <span className={`lo-numberline__${kind}-mark`} aria-hidden="true" />
      {label && <span className={`lo-numberline__${kind}-label`}>{label}</span>}
    </span>
  );
}

function NumberLineInput(props: RuntimeProps) {
  const { min, max, step, initial, reference, referenceLabel, showValue, title, lang,
          display, markerLabel, placeholder } = props as any;

  const ticks = getTicks(props);
  // Ticks imply snapping to them; a bare line snaps to `step`.
  const snap = props.snap ?? (ticks.length > 0 ? 'ticks' : 'step');

  // Both expression attributes are resolved through one subscription.
  const resolved = useReferences(props, extractAndMergeRefs(
    ...[initial, reference].filter(Boolean).map((e: any) => e.expr)
  ));
  const evalContext = createEvalContext(resolved);

  const stored = useFieldSelector(props, props.fields.value, { fallback: null });
  const readonlyField = useFieldSelector(props, props.fields.readonly, { fallback: props.readonly });
  // Also locked while a related grader is grading, or once the enclosing
  // problem's lockInput= condition holds.
  const gradingLocked = useInputReadOnly(props);
  const disabled = Boolean(readonlyField || gradingLocked);
  const { kids } = useKids(props);

  const isUnset = stored === null || stored === undefined;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  const percentOf = (value: number) => ((clamp(value) - min) / (max - min)) * 100;
  const lineInfo: NumberLineInfo = { min, max, percentOf };

  // initial= as a number, or null when the expression is absent: an
  // `average([...])` over items nobody has answered yet, a ref to a block
  // with no value, NaN. The two modes read that null differently — the input
  // rests at the midpoint, the display draws nothing.
  const initialPosition = evaluateNumber(initial, evalContext);
  const referencePosition = evaluateNumber(reference, evalContext);

  const formatNumber = (value: number) => {
    try {
      return new Intl.NumberFormat(lang || undefined).format(value);
    } catch {
      return String(value);
    }
  };
  // What is said at a position — the tick's own words, not its number.
  const textAt = (value: number) => {
    const tick = nearestTick(ticks, value);
    return tick && snap === 'ticks' ? tick.text : formatNumber(value);
  };

  // No hard-coded English: the name comes from the author's title=, and
  // failing that from the endpoint ticks' own text.
  const endpointName = ticks.length > 1
    ? `${ticks[0].text} – ${ticks[ticks.length - 1].text}`.trim()
    : (ticks[0]?.text ?? '');
  const label = title || endpointName || undefined;

  const marks = (extra?: React.ReactNode) => (
    <div className="lo-numberline__marks">
      <NumberLineContext.Provider value={lineInfo}>
        {kids}
      </NumberLineContext.Provider>
      {referencePosition !== null && (
        <Mark kind="reference" percent={percentOf(referencePosition)} label={referenceLabel} />
      )}
      {extra}
    </div>
  );

  // ── Display mode ──────────────────────────────────────────────────────
  // A picture of a computed position. No control: not a hidden one, not a
  // disabled one — nothing a learner or a screen reader can mistake for
  // something to operate. The figure names itself with the position it
  // shows; the placeholder stays OUTSIDE it, as real text, because it is
  // addressed to the learner and role="img" would swallow it.
  if (display) {
    const shown = initialPosition === null ? null : clamp(initialPosition);
    const positionText = shown === null ? null : textAt(shown);
    const figureName = [label, positionText ?? placeholder].filter(Boolean).join(': ') || undefined;

    return (
      <div className="lo-numberline lo-numberline--display"
           data-display="true"
           data-absent={shown === null ? 'true' : 'false'}>
        <div className="lo-numberline__display" role="img" aria-label={figureName}>
          <div className="lo-numberline__track" aria-hidden="true" />
          {marks(shown === null ? undefined : (
            <Mark kind="marker" percent={percentOf(shown)} label={markerLabel} />
          ))}
        </div>
        {shown === null && placeholder && (
          <span className="lo-numberline__placeholder">{placeholder}</span>
        )}
        {showValue && positionText !== null && (
          <span className="lo-numberline__value">{positionText}</span>
        )}
      </div>
    );
  }

  // ── Input mode ────────────────────────────────────────────────────────
  // Where the thumb rests while unanswered: initial=, else the midpoint.
  const position = clamp(isUnset ? (initialPosition ?? (min + max) / 2) : Number(stored));
  const valueText = textAt(position);

  // With snap="ticks" the line steps natively but commits to the nearest
  // tick — ticks need not be evenly spaced, so this is not a rounding of
  // step but a lookup.
  const committedValue = (raw: number) =>
    snap === 'ticks' && ticks.length > 0 ? nearestTick(ticks, raw)!.value : raw;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    if (!Number.isFinite(raw)) return;
    updateField(props, props.fields.value, committedValue(raw));
  };

  // Answering without moving anything: a click on the thumb where it already
  // rests, or Home when the thumb is already at min, produces no change
  // event — so an unanswered line would stay unanswered even though the
  // learner just told us their answer is the resting position. Only while
  // unset: once there is a value, onChange owns every move.
  const commitIfUnset = (event: React.SyntheticEvent<HTMLInputElement>) => {
    if (!isUnset || disabled) return;
    const raw = Number(event.currentTarget.value);
    if (!Number.isFinite(raw)) return;
    updateField(props, props.fields.value, committedValue(raw));
  };

  return (
    <div className="lo-numberline" data-unset={isUnset ? 'true' : 'false'}>
      <input
        type="range"
        className="lo-numberline__input"
        min={min}
        max={max}
        step={step}
        value={position}
        onChange={onChange}
        onPointerUp={commitIfUnset}
        onKeyUp={commitIfUnset}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText}
      />
      {marks()}
      {showValue && <span className="lo-numberline__value">{valueText}</span>}
      <DisplayAnswer props={props} />
    </div>
  );
}

export default NumberLineInput;
