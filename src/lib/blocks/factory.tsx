// lib/blocks/factory.tsx
import React from 'react';
import { z } from 'zod';

const ReduxFieldDict = z.record(z.string(), z.string());
const ReduxFieldsReturn = z.object({
  fields: ReduxFieldDict,
  events: ReduxFieldDict,
  fieldToEventMap: ReduxFieldDict,
  eventToFieldMap: ReduxFieldDict,
}).strict();

// === Schema ===
export const BlockConfigSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().nonempty(),
  component: z.custom<React.ComponentType<any>>().optional(),
  action: z.function().optional(),
  parser: z.function().optional(),
  reducers: z.array(z.function()).optional(),
  fields: ReduxFieldsReturn.optional(),
  getValue: z.function().optional(),
  extraDebug: z.custom<React.ComponentType<any>>().optional(),
  description: z.string().optional(),
}).strict();

export type BlockConfig = z.infer<typeof BlockConfigSchema>;

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

// === Main factory ===
function createBlock(config: BlockConfig): React.ComponentType<any> {
  const parsed = BlockConfigSchema.parse(config);
  const Component = config.component ?? (() => null);

  // === Strict name resolution ===
  const rawName =
    parsed.name ??
    (Component.displayName || Component.name);

  const olxName = rawName.startsWith('_') ? rawName.slice(1) : rawName;

  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new Error(
      `createBlock: Could not infer a valid name. You must provide a non-empty 'name' or pass a named component.`
    );
  }

  // HACK: Blocks should be react components with properties. We wrapped this up in a dictionary for debugging.
  // We should annotate the component itself with:   
  // (Block as any)._isBlock = true
  // And similar.
  // Commit 430ab50f062a538d95c7d5d9630e7783d696de25 is the last one using the preferred format.
  const Block = {
    component: Component,
    _isBlock: true,

    action: config.action,
    parser: config.parser,
    reducers: config.reducers ?? [],
    getValue: config.getValue,
    fields: parsed?.fields?.fieldToEventMap || {},

    OLXName: olxName,
    description: parsed.description,
    namespace: parsed.namespace,

    isAction: typeof parsed.action === 'function',
    isInput: typeof parsed.getValue === 'function',

    spec: config
  }


  assertUnimplemented(parsed.reducers, 'reducers');

  return Block;
}

export const blocks = (namespace: string) =>
  (config: Omit<BlockConfig, 'namespace'>) =>
    createBlock({ ...config, namespace });
