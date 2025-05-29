// /src/lib/blocks/selectors.ts
//
// This file supercedes and obsoletes selectors.ts in lo_assess, which should eventually be removed.

import { useSelector, shallowEqual } from 'react-redux';

// Unified options type
export interface SelectorOptions<T = any> {
  fallback?: T;
  equalityFn?: (a: T, b: T) => boolean;
  // Consider adding: [key: string]: any; // For future Redux or custom extensions
}
export type SelectorExtraParam<T = any> = SelectorOptions<T> | ((a: T, b: T) => boolean);

// --- Normalize options
function normalizeOptions<T = any>(arg?: SelectorExtraParam<T>): SelectorOptions<T> {
  if (arg === undefined) return {};
  if (typeof arg === 'function') return { equalityFn: arg };
  if (typeof arg === 'object') return arg;
  throw new Error(`[selectors] Invalid selector options: ${arg}`);
}

// --- Selectors ---

export function useApplicationSelector<T = any>(
  selector: (state: any) => T = s => s,
  options?: SelectorExtraParam<T>
): T {
  const { fallback, ...rest } = normalizeOptions(options);
  return useSelector(
    state => {
      const val = selector(state?.application_state);
      return val !== undefined ? val : fallback;
    },
    rest.equalityFn,
  );
}

export function useComponentSelector<T = any>(
  id: string,
  selector: (state: any) => T = s => s,
  options?: SelectorExtraParam<T>
): T {
  return useApplicationSelector(
    s => selector(s?.component_state?.[id]),
    options
  );
}

export function useSettingSelector<T = any>(
  setting: string,
  options?: SelectorExtraParam<T>
): T {
  const { fallback, ...rest } = normalizeOptions(options);
  return useSelector(
    state => {
      const val = state?.settings?.[setting];
      return val !== undefined ? val : fallback;
    },
    rest.equalityFn
  );
}

export function useFieldSelector<T = any>(
  id: string,
  field: string,
  options?: SelectorExtraParam<T>
): T {
  const { fallback, ...rest } = normalizeOptions(options);
  return useComponentSelector(
    id,
    s => s?.[field] !== undefined ? s[field] : fallback,
    rest
  );
}

export function useReduxInput(id, field, fallback = '') {
  // Value for this field from Redux, or fallback
  const value = useComponentSelector(id, state =>
    state && state[field] !== undefined ? state[field] : fallback
  );

  // Selection info for this field (shallowEqual to prevent extra rerenders)
  const selection = useComponentSelector(
    id,
    state => ({
      selectionStart: state?.[`${field}.selectionStart`] ?? null,
      selectionEnd: state?.[`${field}.selectionEnd`] ?? null
    }),
    shallowEqual
  );

  // Handle input changes, dispatch Redux/log event, save cursor
  const onChange = useCallback((event) => {
    const val = event.target.value;
    const selStart = event.target.selectionStart;
    const selEnd = event.target.selectionEnd;

    lo_event.logEvent(UPDATE_INPUT, {
      id,
      [field]: val,
      [`${field}.selectionStart`]: selStart,
      [`${field}.selectionEnd`]: selEnd
    });
  }, [id, field]);

  // Restore cursor after Redux render (fixes input/cursor bugs)
  const onFocus = useCallback(() => {
    const inputs = document.getElementsByName(field);
    for (const input of inputs) {
      if (document.activeElement === input && selection.selectionStart != null) {
        input.setSelectionRange(selection.selectionStart, selection.selectionEnd);
      }
    }
  }, [field, selection.selectionStart, selection.selectionEnd]);

  // For use in <input {...props} />
  return [value, {
    name: field,
    value,
    onChange,
    onFocus
  }];
}


// Export internals for test
export const __testables = {
  normalizeOptions
};
