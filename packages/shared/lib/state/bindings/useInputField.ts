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
