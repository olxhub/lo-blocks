// src/components/blocks/Ref.ts
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { valueSelector, fieldByName, fieldSelector } from '@/lib/state';
import { blockData, withStatus } from '@/lib/state/blockData';
import { leafDefinitionKeyFromStateKey, stateKeyForGlobalRef, parseAnyStateRef , PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import { srcAttributes, z_stateRef } from '@/lib/blocks/attributeSchemas';
import { selectBlock, selectBlockState } from '@/lib/state/olxjson';
import _Ref from './_Ref';
import type { RuntimeProps, StateKey, DefinitionKey, BlockDataResult } from '@/lib/types';

/**
 * Convert any value to a string representation for display.
 * Used by both selectValue (for programmatic access) and _Ref (for rendering).
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
  ...parsers.textToAttribute('target'), // <Ref>id</Ref> compiles to target="id" in attributes
  name: 'Ref',
  requiresUniqueId: false,
  component: _Ref,
  description: 'Reference another component\'s value by ID via target attribute.',
  attributes: srcAttributes.extend({
    target: z_stateRef.optional().describe('ID of component to reference'),
    field: z.string().optional().describe('Specific field to access from target'),
    visible: z.enum(['true', 'false']).optional().describe('Set to "false" to hide the reference display'),
    fallback: z.string().optional().describe('Fallback value when target is empty'),
    format: z.enum(['code']).optional().describe('Display format for the value'),
  }),
  selectValue: withStatus((props: RuntimeProps, state: any, stateKey: StateKey): BlockDataResult & { value: any } => {
    // TODO: This logic is infrastructure, not component logic. selectValue should move to /lib/
    // so it can access runtime context properly without accessing props directly.
    // Get the Ref block from Redux to access its attributes and content
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const locale = props.runtime.locale.code;
    const refNode = selectBlock(state, sources, leafDefinitionKeyFromStateKey(stateKey), locale);
    if (!refNode) {
      return { value: '', ...blockData('error', 'Component not found') };
    }

    // Target is always in attributes (parser moves text content → target attribute)
    const targetId = typeof refNode.attributes?.target === 'string'
      ? refNode.attributes.target : '';

    if (!targetId) {
      return { value: '', ...blockData('error', 'No target specified. Use target= attribute or <Ref>targetId</Ref>.') };
    }

    // Qualify the target ref into a proper StateKey for Redux lookup.
    // Ref targets are resolved globally (not scoped by idPrefix).
    const targetRef = parseAnyStateRef(targetId);
    const targetStateKey = stateKeyForGlobalRef(targetRef, props.runtime?.ns ?? PLACEHOLDER_NS);
    const targetDefinitionKey = leafDefinitionKeyFromStateKey(targetStateKey);

    // Check if target exists in Redux — distinguish loading from missing
    if (!selectBlock(state, sources, targetDefinitionKey, locale)) {
      const bs = selectBlockState(state, sources, targetDefinitionKey);
      if (bs?.loadingState?.status === 'error') {
        return { value: '', ...blockData('error', `Target "${targetId}" not found`) };
      }
      return { value: '', ...blockData('loading') };
    }

    const rawField = refNode.attributes?.field;
    const field = typeof rawField === 'string' ? rawField : undefined;

    const rawFallback = refNode.attributes?.fallback;
    const fallback = typeof rawFallback === 'string' ? rawFallback : '';

    if (field) {
      const fieldInfo = fieldByName(field);
      if (!fieldInfo) {
        return { value: '', ...blockData('error', `Unknown field "${field}"`) };
      }
      const rawValue = fieldSelector(state, props, fieldInfo, { stateKey: targetStateKey, fallback });
      return { value: formatRefValue(rawValue, fallback), ...blockData('ready') };
    }

    // Use valueSelector to get the target's value — propagate its status
    const { value: rawValue, ...status } = valueSelector(props, state, targetStateKey, { fallback });
    return { value: formatRefValue(rawValue, fallback), ...status };
  })
});

export default Ref;
