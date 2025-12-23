// src/components/blocks/Ref.jsx
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { valueSelector, fieldByName, fieldSelector } from '@/lib/state';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _Ref from './_Ref';

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
  getValue: (props, state, id) => {
    // Get the Ref block from idMap to access its attributes and content
    const refNode = props.idMap[id];
    if (!refNode) {
      return { error: true, message: 'Component not found' };
    }

    // Target can come from attribute or text content (kids)
    const targetId = refNode.attributes?.target ||
                     (typeof refNode.kids === 'string' ? refNode.kids : String(refNode.kids || '')).trim();

    if (!targetId) {
      return { error: true, message: 'No target specified. Use target attribute or provide ID as content.' };
    }

    // Check if target exists in idMap
    if (!props.idMap[targetId]) {
      return { error: true, message: `Target "${targetId}" not found` };
    }

    // Check if a specific field is requested
    const field = refNode.attributes?.field;

    const fallback = refNode.attributes?.fallback || '';

    let rawValue;
    if (field) {
      // Access specific field using fieldSelector
      const fieldInfo = fieldByName(field);
      if (!fieldInfo) {
        return { error: true, message: `Unknown field "${field}"` };
      }
      rawValue = fieldSelector(state, { ...props, id: targetId }, fieldInfo, { fallback });
    } else {
      // Use valueSelector to get the target's value (calls getValue if available)
      rawValue = valueSelector(props, state, targetId, { fallback });
    }

    // Always return a string for valid values
    return formatRefValue(rawValue, fallback);
  }
});

export default Ref;
