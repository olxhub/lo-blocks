// packages/shared/lib/state/bindings/index.ts
//
// UI binding hooks — wire data structure hooks to DOM elements.
//
// Data structures (useFieldState, useSet, useDocField) provide [value, setValue].
// Bindings add UI concerns: onChange handlers, ref for cursor restoration,
// selection tracking, validation.
//
// Example: useInputField wraps useFieldState and returns [value, inputProps]
// that can be spread onto an <input> or <textarea>.
//

export { useInputField } from './useInputField';
