// blocks.tsx
import React from 'react';
import { z } from 'zod';

// === Schema ===
export const BlockConfigSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().nonempty(),
  component: z.custom<React.ComponentType<any>>().optional(),
  //component: z.any().optional(),
  action: z.function().optional(),
  parser: z.function().optional(),
  reducers: z.array(z.function()).optional(),
  getValue: z.function().optional(),
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
  const Component = parsed.component ?? (() => null);

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

  const Block = Component;

  (Block as any)._isBlock = true;
  (Block as any).OLXName = olxName;
  (Block as any).isAction = typeof parsed.action === 'function';
  (Block as any).action = parsed.action;
  (Block as any).parser = parsed.parser;
  (Block as any).reducers = parsed.reducers ?? [];
  (Block as any).getValue = parsed.getValue;
  (Block as any).namespace = parsed.namespace;

  assertUnimplemented(parsed.reducers, 'reducers');

  // === Metadata: attach flat fields for JS/TS symmetry ===
  (Block as any).description = parsed.description;

  return Block;
}

export const blocks = (namespace: string) =>
  (config: Omit<BlockConfig, 'namespace'>) =>
    createBlock({ ...config, namespace });