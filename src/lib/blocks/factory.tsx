// src/lib/blocks/factory.tsx
//
// Block factory - the core mechanism for creating Learning Observer blocks.
//
// This file implements the `createBlock()` function that transforms a BlockBlueprint
// configuration into a fully-formed Block object. Blocks are the fundamental unit
// of interactivity in Learning Observer - each block combines:
// - A React component for rendering
// - Parser logic for processing OLX content
// - State fields for data management
// - Optional actions (grading, LLM calls, etc.)
//
// The factory handles name resolution, validation, and creates the standardized
// Block interface that the rest of the system expects. It also provides namespace
// support for organizing blocks by domain/author.
//
import React from 'react';

import { BlockBlueprint, BlockBlueprintSchema, Block, FieldInfoByField } from '../types';

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

// === Main factory ===
function createBlock(config: BlockBlueprint): Block {
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
  const block: Block = {
    component: Component,
    _isBlock: true,

    action: config.action,
    parser: config.parser,
    staticKids: config.staticKids,
    reducers: config.reducers ?? [],
    getValue: config.getValue,
    fields: parsed?.fields?.fieldInfoByField as FieldInfoByField ?? {},
    locals: config.locals,

    OLXName: olxName,
    description: parsed.description,
    namespace: parsed.namespace,
    internal: config.internal,
    category: config.category,
    requiresUniqueId: config.requiresUniqueId,
    attributeSchema: config.attributeSchema,

    blueprint: config
  }
  assertUnimplemented(parsed.reducers, 'reducers');

  return block;
}

export const blocks = (namespace: string) =>
  (config: Omit<BlockBlueprint, 'namespace'>, locals?: any) =>
    createBlock({ ...config, namespace, locals: locals ?? config.locals });
