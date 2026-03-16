// lib/state/fieldTypes/classic/doc.ts
//
// Classic document field — plain string storage, no CRDT.
//
// In classic mode, docField is just stateField: the text is stored bare
// in Redux, edits replace the whole string (UPDATE_VALUE), no splice
// deltas, no RGA. This is functionally identical to what main does.
//
// The CRDT version (crdt/doc.ts) adds RGA for collaborative editing.
//
import { stateField } from './state';
import type { FieldInfo } from '../../../types';

/**
 * Classic document field — stores text as a bare string.
 * Thin wrapper around stateField.
 */
export function docField(name: string, opts?: Partial<FieldInfo>): FieldInfo {
  return stateField(name, opts);
}
