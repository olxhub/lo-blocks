// lib/state/bindings/useInputField.ts
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
// after each keystroke. We store selectionStart/selectionEnd as sibling
// keys in Redux alongside the value, and restore them after re-render.
//

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useFieldState, useFieldSelector, updateField } from '../redux';
import { shallowEqual } from 'react-redux';
import type { FieldInfo, RuntimeProps, StateKey } from '../../types';

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
  const [value, setValue] = useFieldState(props, field, fallback, { stateKey, tag });

  // Selection state — stored as sibling keys in Redux alongside the value
  const selection = useFieldSelector(
    props,
    field,
    {
      selector: (cs: any) => ({
        selectionStart: cs?.[`${field.name}.selectionStart`] ?? 0,
        selectionEnd: cs?.[`${field.name}.selectionEnd`] ?? 0,
      }),
      equalityFn: shallowEqual,
      stateKey,
      tag,
    }
  );

  const ref = useRef<any>(null);

  // Call updateField directly (not setValue) so we can pass extraPayload
  // for cursor position. setValue doesn't accept extraPayload because
  // callers like CodeMirror pass unrelated second args (ViewUpdate) that
  // would get spread into the event payload and break serialization.
  const fieldRef = useRef({ props, field, stateKey, tag });
  fieldRef.current = { props, field, stateKey, tag };

  const onChange = useCallback((event: any) => {
    const val = event.target.value;
    if (updateValidator && !updateValidator(val)) return;

    const { props, field, stateKey, tag } = fieldRef.current;
    updateField(props, field, val, {
      stateKey, tag,
      extraPayload: {
        [`${field.name}.selectionStart`]: event.target.selectionStart,
        [`${field.name}.selectionEnd`]: event.target.selectionEnd,
      },
    });
  }, [updateValidator]);

  // Restore cursor position after Redux-driven re-render
  useEffect(() => {
    const input = ref.current;
    if (
      input &&
      document.activeElement === input &&
      selection.selectionStart != null &&
      selection.selectionEnd != null
    ) {
      try {
        input.setSelectionRange(selection.selectionStart, selection.selectionEnd);
      } catch (e) { /* ignore — not all input types support setSelectionRange */ }
    }
  }, [value, selection.selectionStart, selection.selectionEnd]);

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
