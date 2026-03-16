// lib/state/fieldTypes/classic/set.ts
//
// Classic set field — plain value storage, no CRDT.
//
// The constructor is here (cycle-safe — no React/Redux imports).
// useSet is in useSet.ts (imports from redux.ts — can't be in the barrel).
//
import { stateField } from './state';
import type { FieldInfo } from '../../../types';

/**
 * Classic set field — stores values as a plain value.
 * Thin wrapper around stateField.
 */
export function setField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  return stateField(name, opts);
}
