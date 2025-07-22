// src/lib/blocks/factory.tsx
import React from 'react';
import { z } from 'zod';

const ReduxFieldInfo = z.object({
  type: z.literal('field'),
  name: z.string(),
  event: z.string(),
  scope: z.string(),
}).strict();
const ReduxFieldInfoMap = z.record(ReduxFieldInfo);
export const ReduxFieldsReturn = z.object({
  fieldInfoByField: ReduxFieldInfoMap,
  fieldInfoByEvent: ReduxFieldInfoMap,
}).strict();

// === Schema ===
export const BlockBlueprintSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().nonempty(),
  component: z.custom<React.ComponentType<any>>().optional(),
  action: z.function().optional(),
  isGrader: z.boolean().optional(),
  parser: z.function().optional(),
  staticKids: z.function().optional(),
  reducers: z.array(z.function()).optional(),
  fields: ReduxFieldsReturn.optional(),
  getValue: z.function().optional(),
  extraDebug: z.custom<React.ComponentType<any>>().optional(),
  description: z.string().optional(),
}).strict();

export type BlockBlueprint = z.infer<typeof BlockBlueprintSchema>;

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

type BlockComponent = React.ComponentType<any> & {
  _isBlock: true;
  component: React.ComponentType<any>;
  action?: (...args: unknown[]) => unknown;
  parser?: (...args: unknown[]) => unknown;
  staticKids?: (...args: unknown[]) => unknown;
  reducers: ((...args: unknown[]) => unknown)[];
  getValue?: (...args: unknown[]) => unknown;
  fields?: Record<string, any>;
  OLXName: string;
  description?: string;
  namespace: string;
  blueprint: BlockBlueprint;
};

// === Main factory ===
function createBlock(config: BlockBlueprint): BlockComponent {
  const parsed = BlockBlueprintSchema.parse(config);
  const Component: React.ComponentType<any> = config.component ?? (() => null);

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
  const Block: BlockComponent = (props) => <Component {...props} />;

  // ✅ Attach strongly typed metadata
  Block._isBlock = true;
  Block.component = Component;
  Block.action = config.action;
  Block.parser = config.parser;
  Block.staticKids = config.staticKids;
  Block.reducers = config.reducers ?? [];
  Block.getValue = config.getValue;
  Block.fields = parsed?.fields?.fieldInfoByField ?? {};
  Block.OLXName = olxName;
  Block.description = parsed.description;
  Block.namespace = parsed.namespace;
  Block.blueprint = config;

  assertUnimplemented(parsed.reducers, 'reducers');

  return Block;
}

export const blocks = (namespace: string) =>
  (config: Omit<BlockBlueprint, 'namespace'>) =>
    createBlock({ ...config, namespace });
