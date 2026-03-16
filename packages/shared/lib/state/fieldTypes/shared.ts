// lib/state/fieldTypes/shared.ts
//
// Shared utilities used by all field type constructors.
//
import type { FieldEvent } from '../../types';

/**
 * Converts a camelCase field name into a default event name.
 *
 * Example: fieldNameToDefaultEventName('submitCount') → 'UPDATE_SUBMIT_COUNT'
 *
 * Used by field constructors to derive the event type from the field name
 * when the block author doesn't specify one explicitly.
 */
export function fieldNameToDefaultEventName(name: string): FieldEvent {
  return ('UPDATE_' + name.replace(/([a-z\d])([A-Z])/g, '$1_$2').toUpperCase()) as FieldEvent;
}
