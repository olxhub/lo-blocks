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

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { useFieldState, fieldSelector } from '../redux';
import type { FieldInfo, RuntimeProps, ReduxStateKey } from '../../types';

type InputFieldOptions = {
  updateValidator?: (val: string) => boolean;
  reduxKey?: ReduxStateKey;
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
  { updateValidator, reduxKey, tag }: InputFieldOptions = {}
) {
  const [value, setValue] = useFieldState(props, field, fallback, { reduxKey, tag });

  // Selection state — stored as sibling keys in Redux
  const selection = useSelector(
    (state: any) => {
      const s = fieldSelector(state, props, field, {
        reduxKey,
        tag,
        selector: (cs) => ({
          selectionStart: cs?.[`${field.name}.selectionStart`] ?? 0,
          selectionEnd: cs?.[`${field.name}.selectionEnd`] ?? 0,
        }),
      });
      return s;
    },
    shallowEqual
  );

  const ref = useRef<any>(null);

  const onChange = useCallback((event: any) => {
    const val = event.target.value;
    if (updateValidator && !updateValidator(val)) return;
    setValue(val);
  }, [setValue, updateValidator]);

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
