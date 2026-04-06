// packages/shared/lib/state/stateDisplay.ts
//
// Shared state display utilities for debugging/introspection components.
//
// Used by both StateViewer (block) and StatePanel (docs chrome) to decode
// raw Redux component state through field display functions.

import { displayField } from '@/lib/state';
import type { FieldInfo } from '@/lib/types';

/**
 * Decode raw component state through field display functions.
 *
 * Returns { decoded: { fieldName: displayString }, meta: { key: value } }
 * where meta contains CRDT metadata keys (timestamps, actors, etc.)
 * that aren't user-visible fields.
 */
export function decodeState(
  rawState: Record<string, any>,
  fields: Record<string, FieldInfo> | undefined,
): { decoded: Record<string, string>; meta: Record<string, any> } {
  const decoded: Record<string, string> = {};
  const meta: Record<string, any> = {};

  if (!fields) {
    // No field definitions — just show everything as-is
    for (const [key, value] of Object.entries(rawState)) {
      decoded[key] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    }
    return { decoded, meta };
  }

  const fieldNames = new Set<string>();
  for (const field of Object.values(fields)) {
    if (field && typeof field === 'object' && field.type === 'field') {
      fieldNames.add(field.name);
      decoded[field.name] = displayField(field, rawState[field.name]);
    }
  }

  // Remaining keys are metadata (timestamps, actors, selection state, etc.)
  for (const key of Object.keys(rawState)) {
    if (!fieldNames.has(key)) {
      meta[key] = rawState[key];
    }
  }

  return { decoded, meta };
}
