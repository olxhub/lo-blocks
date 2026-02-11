// src/components/blocks/Ref.ts
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { valueSelector, fieldByName, fieldSelector } from '@/lib/state';
import { refToOlxKey, toOlxReference } from '@/lib/blocks/idResolver';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import { selectBlock } from '@/lib/state/olxjson';
import _Ref from './_Ref';
import type { RuntimeProps, OlxReference } from '@/lib/types';

/**
 * Convert any value to a string representation for display.
 * Used by both getValue (for programmatic access) and _Ref (for rendering).
 */
export function formatRefValue(val, fallback = '') {
  if (val === null || val === undefined) {
    return fallback;
  }
  if (typeof val === 'string') {
    return val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  // Arrays of primitives - join with comma
  if (Array.isArray(val)) {
    const allPrimitive = val.every(
      item => item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    );
    if (allPrimitive) {
      return val.join(', ');
    }
  }
  // Objects, arrays with objects, or other complex types - JSON stringify
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch (e) {
      return '[unserializable]';
    }
  }
  if (typeof val === 'function') {
    return '[function]';
  }
  return '[unknown]';
}

const Ref = core({
  ...parsers.text(), // Support text content like Element
  name: 'Ref',
  component: _Ref,
  description: 'Reference another component\'s value by ID. Supports both target attribute and text content.',
  attributes: srcAttributes.extend({
    target: z.string().optional().describe('ID of component to reference'),
    field: z.string().optional().describe('Specific field to access from target'),
    visible: z.enum(['true', 'false']).optional().describe('Set to "false" to hide the reference display'),
    fallback: z.string().optional().describe('Fallback value when target is empty'),
    format: z.enum(['code']).optional().describe('Display format for the value'),
  }),
  getValue: (props: RuntimeProps, state: any, id: OlxReference) => {
    // TODO: This logic is infrastructure, not component logic. getValue should move to /lib/
    // so it can access runtime context properly without accessing props directly.
    // Get the Ref block from Redux to access its attributes and content
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const locale = props.runtime.locale.code;
    const refNode = selectBlock(state, sources, refToOlxKey(id), locale);
    if (!refNode) {
      return { error: true, message: 'Component not found' };
    }

    // Target can come from attribute or text content (kids)
    const rawTarget = refNode.attributes?.target;
    const targetId = (typeof rawTarget === 'string' ? rawTarget : '') ||
                     (typeof refNode.kids === 'string' ? refNode.kids : String(refNode.kids || '')).trim();

    if (!targetId) {
      return { error: true, message: 'No target specified. Use target attribute or provide ID as content.' };
    }

    // Check if target exists in Redux
    if (!selectBlock(state, sources, refToOlxKey(toOlxReference(targetId)), locale)) {
      return { error: true, message: `Target "${targetId}" not found` };
    }

    // Check if a specific field is requested
    const rawField = refNode.attributes?.field;
    const field = typeof rawField === 'string' ? rawField : undefined;

    const rawFallback = refNode.attributes?.fallback;
    const fallback = typeof rawFallback === 'string' ? rawFallback : '';

    // HACK: Force absolute path for cross-block references.
    //
    // TODO: This is a workaround for idPrefix context differences.
    // When Ref is rendered in one context (e.g., inside a SortableInput) but
    // references a component rendered elsewhere (e.g., a TextArea), the idPrefix
    // contexts differ. Absolute paths ("/id") bypass idPrefix in refToReduxKey.
    //
    // Proper fix: Unify ID resolution so cross-block refs work without this hack.
    const absoluteTargetId = targetId.startsWith('/') ? targetId : `/${targetId}`;

    let rawValue;
    if (field) {
      // Access specific field using fieldSelector
      const fieldInfo = fieldByName(field);
      if (!fieldInfo) {
        return { error: true, message: `Unknown field "${field}"` };
      }
      rawValue = fieldSelector(state, { ...props, id: absoluteTargetId }, fieldInfo, { fallback });
    } else {
      // Use valueSelector to get the target's value (calls getValue if available)
      rawValue = valueSelector(props, state, toOlxReference(absoluteTargetId), { fallback });
    }

    // Always return a string for valid values
    return formatRefValue(rawValue, fallback);
  }
});

export default Ref;
