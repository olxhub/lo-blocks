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

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useFieldSelector, rawFieldSelector, decodeField, updateField } from '../redux';
import { commonFields } from '../commonFields';
import type { FieldInfo, RuntimeProps, StateKey } from '../../types';

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

  const onChange = useCallback((event: any) => {
    const val = event.target.value;
    if (updateValidator && !updateValidator(val)) return;

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

  // Restore cursor position after Redux-driven re-render
  useEffect(() => {
    const input = ref.current;
    if (
      input &&
      document.activeElement === input &&
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
      ref,
    }
  ] as const;
}
