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
import { z } from 'zod';

import { BlockBlueprint, BlockBlueprintSchema, Block, FieldInfoByField } from '../types';
import { baseAttributes } from './attributeSchemas';
import * as state from '@/lib/state';

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

// === Mixin extensions ===
// These functions extend config based on mixin flags (isGrader, isInput, etc.)

// Standard fields for graders
const GRADER_FIELDS = ['correct', 'message', 'showAnswer'];

// Standard attributes for graders
const GRADER_ATTRIBUTES = baseAttributes.extend({
  answer: z.string().optional(),
  displayAnswer: z.string().optional(),
  target: z.string().optional(),
});

/**
 * Extend config for grader blocks.
 * Adds standard fields (correct, message, showAnswer) and attributes (answer, displayAnswer, target).
 */
function applyGraderExtensions(config: BlockBlueprint): BlockBlueprint {
  if (!config.isGrader) return config;

  // Extend fields - only add grader fields not already defined
  const existingFieldNames = Object.keys(config.fields?.fieldInfoByField ?? {});
  const fieldsToAdd = GRADER_FIELDS.filter(f => !existingFieldNames.includes(f));

  let extendedFields = config.fields;
  if (fieldsToAdd.length > 0) {
    const newFields = state.fields(fieldsToAdd);
    extendedFields = config.fields
      ? config.fields.extend(newFields)
      : newFields;
  }

  // Extend attributes - merge with grader attributes
  const extendedSchema = config.attributes
    ? config.attributes.and(GRADER_ATTRIBUTES)
    : GRADER_ATTRIBUTES;

  return {
    ...config,
    fields: extendedFields,
    attributes: extendedSchema,
  };
}

// Future: applyInputExtensions, applyActionExtensions, etc.

// === Main factory ===
function createBlock(config: BlockBlueprint): Block {
  // Apply mixin extensions
  const effectiveConfig = applyGraderExtensions(config);

  const parsed = BlockBlueprintSchema.parse(effectiveConfig);
  const Component: React.ComponentType<any> = effectiveConfig.component ?? (() => null);

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

    action: effectiveConfig.action,
    parser: effectiveConfig.parser,
    staticKids: effectiveConfig.staticKids,
    reducers: effectiveConfig.reducers ?? [],
    getValue: effectiveConfig.getValue,
    fields: parsed?.fields?.fieldInfoByField as FieldInfoByField ?? {},
    locals: effectiveConfig.locals,

    OLXName: olxName,
    description: parsed.description,
    namespace: parsed.namespace,
    internal: effectiveConfig.internal,
    category: effectiveConfig.category,
    requiresUniqueId: effectiveConfig.requiresUniqueId,
    attributes: effectiveConfig.attributes,
    requiresGrader: effectiveConfig.requiresGrader,
    isGrader: effectiveConfig.isGrader,
    getDisplayAnswer: effectiveConfig.getDisplayAnswer,

    blueprint: effectiveConfig
  }
  assertUnimplemented(parsed.reducers, 'reducers');

  return block;
}

export const blocks = (namespace: string) =>
  (config: Omit<BlockBlueprint, 'namespace'>, locals?: any) =>
    createBlock({ ...config, namespace, locals: locals ?? config.locals });
