// src/components/blocks/Ref.ts
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { valueSelector, fieldByName, fieldSelector } from '@/lib/state';
import { blockData, withStatus } from '@/lib/state/blockData';
import { refToOlxKey, toOlxReference, reduxKeyToOlxKey, refToReduxKey } from '@/lib/blocks/idResolver';
import { srcAttributes, z_reduxStateKey } from '@/lib/blocks/attributeSchemas';
import { selectBlock, selectBlockState, CONTENT_SOURCE } from '@/lib/state/olxjson';
import _Ref from './_Ref';
import type { RuntimeProps, ReduxStateKey, BlockDataResult } from '@/lib/types';

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
    target: z_reduxStateKey.optional().describe('ID of component to reference'),
    field: z.string().optional().describe('Specific field to access from target'),
    visible: z.enum(['true', 'false']).optional().describe('Set to "false" to hide the reference display'),
    fallback: z.string().optional().describe('Fallback value when target is empty'),
    format: z.enum(['code']).optional().describe('Display format for the value'),
  }),
  selectValue: withStatus((props: RuntimeProps, state: any, reduxKey: ReduxStateKey): BlockDataResult & { value: any } => {
    // TODO: This logic is infrastructure, not component logic. selectValue should move to /lib/
    // so it can access runtime context properly without accessing props directly.
    // Get the Ref block from Redux to access its attributes and content
    const sources = props.runtime.olxJsonSources ?? [CONTENT_SOURCE];
    const locale = props.runtime.locale.code;
    const refNode = selectBlock(state, sources, reduxKeyToOlxKey(reduxKey), locale);
    if (!refNode) {
      return { value: '', ...blockData('error', 'Component not found') };
    }

    // Target is always in attributes (parser moves text content → target attribute)
    const targetId = typeof refNode.attributes?.target === 'string'
      ? refNode.attributes.target : '';

    if (!targetId) {
      return { value: '', ...blockData('error', 'No target specified. Use target= attribute or <Ref>targetId</Ref>.') };
    }

    // Check if target exists in Redux — distinguish loading from missing
    const targetKey = refToOlxKey(toOlxReference(targetId));
    if (!selectBlock(state, sources, targetKey, locale)) {
      const bs = selectBlockState(state, sources, targetKey);
      if (bs?.loadingState?.status === 'error') {
        return { value: '', ...blockData('error', `Target "${targetId}" not found`) };
      }
      return { value: '', ...blockData('loading') };
    }

    const rawField = refNode.attributes?.field;
    const field = typeof rawField === 'string' ? rawField : undefined;

    const rawFallback = refNode.attributes?.fallback;
    const fallback = typeof rawFallback === 'string' ? rawFallback : '';

    // HACK: Force absolute path for cross-block references.
    // Absolute paths ("/id") bypass idPrefix in refToReduxKey.
    // TODO: Unify ID resolution so cross-block refs work without this hack.
    const absoluteTargetId = targetId.startsWith('/') ? targetId : `/${targetId}`;
    const targetReduxKey = refToReduxKey(toOlxReference(absoluteTargetId));

    if (field) {
      const fieldInfo = fieldByName(field);
      if (!fieldInfo) {
        return { value: '', ...blockData('error', `Unknown field "${field}"`) };
      }
      const rawValue = fieldSelector(state, props, fieldInfo, { reduxKey: targetReduxKey, fallback });
      return { value: formatRefValue(rawValue, fallback), ...blockData('ready') };
    }

    // Use valueSelector to get the target's value — propagate its status
    const { value: rawValue, ...status } = valueSelector(props, state, targetReduxKey, { fallback });
    return { value: formatRefValue(rawValue, fallback), ...status };
  })
});

export default Ref;
