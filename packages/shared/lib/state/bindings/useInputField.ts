// packages/shared/lib/state/bindings/useInputField.ts
//
// Input field binding — wires a field data structure to an <input> or <textarea>.
//
// Returns [value, inputProps] where inputProps can be spread onto a DOM element:
//   const [value, inputProps] = useInputField(props, fields.value, '');
//   <textarea {...inputProps} />
//
// Handles: onChange dispatch, selection state tracking, cursor restoration.
// Works with any field type — classic stateField, CRDT docField, etc.
// The field's write/reduce handle storage differences; this binding only
// handles the DOM integration.
//
// Why selection tracking matters:
// Redux-controlled inputs (not React-controlled) lose cursor position on
// every re-render. Without explicit tracking, the cursor jumps to the end
// after each keystroke. The cursor is a real field — commonFields.selection,
// { start, end } — written as an `extras` envelope entry riding the value
// event (one dispatch per keystroke) and restored after re-render.
//
// WHO OWNS THE CARET. A focused input owns its own, from a ref written
// synchronously off the DOM. The stored selection is for restoring an
// input nobody is typing in — a remount, a session resumed, a programmatic
// focus. It must not steer a live caret, because it is ordinary shared
// state and everything that can write it can write an OLD position:
// `selection` is a plain stateField folded straight out of the extras
// envelope with no ordering guard, so a replayed event, an event relayed
// from this user's other tab, an adopted bucket riding a content fetch, or
// simply a fold landing a beat behind the keystrokes will each put a stale
// number in it. Restoring from that under a typing learner is the caret
// jumping backwards, and no amount of making the store faster fixes it —
// only not asking the store where the caret is.
//
// A local caret still has to survive edits that arrive from ELSEWHERE:
// when a peer inserts a paragraph above, the caret should move down with
// the text rather than stay on a number. The ref records which text its
// offsets refer to, so anything the store adds beyond that is transformed
// through — and the learner's own edit, already reflected in the ref, is
// not double-counted.
//
// ===========================================================================
// TODO(cursor): cursor state is the weakest part of this binding
// ===========================================================================
//
// Good enough for one learner in one tab, which is the pilot. Flaky the
// moment two people edit one document, and the shape below is why.
//
// THREE DIFFERENT THINGS are conflated into the single `selection` field:
//
//   (a) The live caret of a FOCUSED input. Not shared state at all. It is
//       the ref above, and it must never round-trip through anything
//       async — that was the "caret jumps backwards while typing" bug.
//
//   (b) Cursor HISTORY, for replay and analytics. Integer offsets are
//       sound here, and this is worth stating because it is not obvious:
//       replay folds events in order, so each event's offset is
//       interpreted against the document as of that event. Integers only
//       become unsound for LIVE concurrent editing and for DURABLE
//       positions, neither of which replay is.
//
//   (c) Other people's cursors, and durable bookmarks. Needs anchors, not
//       offsets — see below.
//
// Known defects, roughly in order of how cheaply they can be fixed:
//
//   1. ONE SLOT PER BUCKET, not per field. Co-bucketed inputs share
//      `selection` and disambiguate by stamping `field`, so the last
//      input to be typed in owns the slot and the others read a cursor
//      that is not theirs (they correctly ignore it, and so restore
//      nothing). Two tabs of one user overwrite each other the same way.
//
//   2. MOVES ARE NOT RECORDED. Only `onChange` dispatches; the `onSelect`
//      handler below updates the ref only. So clicking and arrowing are
//      invisible to replay — a learner who reads back through their essay
//      leaves no trace. This predates the CRDT work (there was no
//      `onSelect` handler at all before), but it is more visible now.
//      Cursor moves are high-frequency, so this wants the encode axis
//      (FieldInfo.encoder, state/encode.ts) — debounce or trace — rather
//      than an event per mousemove.
//
//   3. INTEGERS ARE UNSOUND UNDER CONCURRENCY. An offset is meaningful
//      only for the document version it was measured in. Before docFields
//      were CRDTs this was safe — one writer, whole-string LWW, nothing
//      could move the text underneath an offset. It is not safe now, and
//      it is why `carryCaret` above has to exist at all.
//
//      The fix is to anchor to a CHARACTER rather than to a count:
//      { after: ID | null, assoc: 'before' | 'after', epoch } — the ID of
//      the character the cursor follows, which is globally unique and
//      permanent. Peers inserting before or after it need no transform;
//      a deleted anchor stays addressable as a tombstone and resolves by
//      walking toward the associated side. This belongs in the CRDT layer
//      as a real relative-position API (crdt/docText.ts), NOT
//      reconstructed here — upstream ships the forward half as
//      `Text._idAt` but marks it an instructional primitive, so both
//      directions want writing and testing properly. Measured cost of the
//      reverse walk on a cached document is ~0.02ms at 10k characters,
//      about 100x cheaper than the diffing it would replace.
//
//      Note this is ADDITIVE: anchors reference IDs that already exist in
//      every stored document, so adopting them needs no migration and no
//      change to JsonUpdate or SPLICE_INPUT. An old integer cursor read by
//      an anchor-aware client simply fails to resolve and resets once.
//
//   4. NON-DOC FIELDS HAVE NO IDS. LineInput, NumberInput, ColorField and
//      friends are plain stateFields holding strings, where anchors cannot
//      exist. Integers remain correct for them (single writer, no
//      concurrent edits), so the binding will need both paths — which is
//      a good reason to put the anchor logic behind a field-kind check
//      rather than assuming every input is a document.
//
// The deeper shape problem, if this is ever done properly: the field
// system models `field -> value`, but a cursor is `(field, client) ->
// position`. That shape does not exist, which is what defect 1 really is.
// It does NOT have to be built, though: (b) can live entirely in the
// EVENT log rather than in folded state, and (c) is presence — ephemeral,
// TTL'd, excluded from persistence — so neither needs an unbounded
// per-client map inside a student's persisted document state. Adding one
// would grow without bound, since client ids are per session.
//

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useFieldSelector, rawFieldSelector, decodeField, updateField } from '../redux';
import { commonFields } from '../commonFields';
import { computeSplice } from '../../crdt/computeSplice';
import type { FieldInfo, RuntimeProps, StateKey } from '../../types';

/** Where the caret sits, and the text its offsets count into. */
type LocalCaret = { start: number; end: number; forValue: string };

/**
 * Move one offset across a change made somewhere else in the text.
 *
 * Offsets before the change keep their place, offsets after it shift by
 * what the change added or removed, and an offset inside it lands at the
 * end of the replacement — there is nowhere better for a caret sitting in
 * text that no longer exists.
 */
function transformOffset(
  offset: number,
  splice: { index: number; deleteCount: number; inserted: string },
): number {
  if (offset <= splice.index) return offset;
  if (offset >= splice.index + splice.deleteCount) {
    return offset + splice.inserted.length - splice.deleteCount;
  }
  return splice.index + splice.inserted.length;
}

/** The local caret, carried across whatever the store changed underneath it. */
function carryCaret(caret: LocalCaret, value: string): LocalCaret {
  if (caret.forValue === value) return caret;
  const splice = computeSplice(caret.forValue, value);
  return {
    start: transformOffset(caret.start, splice),
    end: transformOffset(caret.end, splice),
    forValue: value,
  };
}

// Stable empty cursor: the selection read compares with shallowEqual, and the
// no-state-yet case must not mint a new object per store dispatch. No `field`
// key, so restore never fires from it (an unfocused-input cursor is unknown,
// not "position 0").
const EMPTY_SELECTION = { field: undefined, start: 0, end: 0 };

type InputFieldOptions = {
  updateValidator?: (val: string) => boolean;
  stateKey?: StateKey;
  tag?: string;
};

/**
 * Binding that wires a field to an input/textarea DOM element.
 *
 * Returns [value, inputProps] — spread inputProps onto the element.
 * Tracks selection state and restores cursor position after re-renders.
 */
export function useInputField(
  props: RuntimeProps,
  field: FieldInfo,
  fallback = '',
  { updateValidator, stateKey, tag }: InputFieldOptions = {}
) {
  // The binding is storage infrastructure: it edits the RAW backing store
  // (decoded for display — level 2). The block's observable getter (a
  // TextArea's kids fallback, CharacterBuilder's composite YAML view) must
  // not leak into the edit loop, or typing would round-trip through policy.
  // Same spine as useFieldSelector's invariant: subscribe level 1 (raw),
  // gate on field.equality (raw representations are reference-stable
  // between dispatches), decode AFTER the gate — never inside it.
  const raw = useSelector(
    (state: any) => rawFieldSelector(state, props, field, { fallback, stateKey, tag }),
    field.equality
  );
  const value = decodeField(field, raw);

  // Cursor state — a plain whole-field read of the shared selection field,
  // which the extras envelope folds into the same bucket as the value.
  const selection = useFieldSelector(props, commonFields.selection, {
    stateKey, tag, fallback: EMPTY_SELECTION, equalityFn: shallowEqual,
  });

  const ref = useRef<any>(null);

  // Call updateField directly (not setValue) so we can pass the extras
  // envelope for cursor position. setValue doesn't accept extras because
  // callers like CodeMirror pass unrelated second args (ViewUpdate) that
  // would get spread into the event payload and break serialization.
  const fieldRef = useRef({ props, field, stateKey, tag, fallback });
  fieldRef.current = { props, field, stateKey, tag, fallback };

  // Where this learner's caret is, read off the DOM at the moment they put
  // it there. Authoritative while the input is focused.
  const caret = useRef<LocalCaret | null>(null);

  // Not every caret move is an edit: clicking and arrowing around change it
  // without producing an event. Tracking `select` keeps the local record
  // current whatever moved it, so an edit arriving from a peer transforms
  // the caret the learner actually has.
  //
  // Deliberately ref-only — it does NOT dispatch. An event per caret move
  // is too frequent to log raw, and the encode axis is the right home for
  // it; see TODO(cursor) defect 2 in the header.
  const onSelect = useCallback((event: any) => {
    caret.current = {
      start: event.target.selectionStart,
      end: event.target.selectionEnd,
      forValue: event.target.value,
    };
  }, []);

  const onChange = useCallback((event: any) => {
    const val = event.target.value;
    if (updateValidator && !updateValidator(val)) return;

    caret.current = {
      start: event.target.selectionStart,
      end: event.target.selectionEnd,
      forValue: val,
    };

    // The same fallback the read above used. Without it the write would
    // diff against "no value" while the learner has been looking at the
    // fallback, and their first keystroke would read as having typed the
    // whole default text (see updateField).
    const { props, field, stateKey, tag, fallback } = fieldRef.current;
    updateField(props, field, val, {
      stateKey, tag, fallback,
      extras: {
        selection: {
          // The bucket holds ONE selection; stamping the owning field lets
          // co-bucketed inputs ignore each other's cursor on restore.
          field: field.name,
          start: event.target.selectionStart,
          end: event.target.selectionEnd,
        },
      },
    });
  }, [updateValidator]);

  // Put the caret back after a Redux-driven re-render reset the DOM value.
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const text = String(value ?? '');

    // Focused: the learner's own caret, carried across anything the store
    // changed underneath it. Never the stored selection — see the header.
    if (document.activeElement === input) {
      if (caret.current === null) return;
      const next = carryCaret(caret.current, text);
      caret.current = next;
      try {
        input.setSelectionRange(next.start, next.end);
      } catch (e) { /* ignore — not all input types support setSelectionRange */ }
      return;
    }

    // Not focused: nothing local to preserve, so the stored selection is
    // the only record of where this learner left off. `field` names the
    // input that owns it, so co-bucketed inputs ignore each other's.
    caret.current = null;
    if (
      selection.field === field.name &&
      selection.start != null &&
      selection.end != null
    ) {
      try {
        input.setSelectionRange(selection.start, selection.end);
      } catch (e) { /* ignore — not all input types support setSelectionRange */ }
    }
  }, [value, selection.field, selection.start, selection.end, field.name]);

  return [
    value,
    {
      name: field.name,
      value,
      onChange,
      onSelect,
      ref,
    }
  ] as const;
}
