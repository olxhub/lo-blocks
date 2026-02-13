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

import { BlockBlueprintSchema, LoBlock, Fields, OLXTag } from '../types';

// Factory-local type aliases derived from the schema
type BlueprintInput = z.input<typeof BlockBlueprintSchema>;
type BlueprintReg = Omit<BlueprintInput, "namespace">;
import { baseAttributes, inputMixin, graderMixin } from './attributeSchemas';
import * as state from '@/lib/state';

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

// === Mixin extensions ===
// These functions extend config based on mixin flags (isGrader, isInput, etc.)

// Standard fields for graders
const GRADER_FIELDS = ['correct', 'message', 'showAnswer', 'submitCount'];

// Standard attributes for graders - uses graderMixin from attributeSchemas
// passthrough preserves additional attrs (like src for PEG parsers)
const GRADER_ATTRIBUTES = baseAttributes.extend(graderMixin.shape).passthrough();

/**
 * Extend config for grader blocks.
 * Adds standard fields (correct, message, showAnswer) and attributes (answer, displayAnswer, target).
 */
function applyGraderExtensions(config: BlueprintInput): BlueprintInput {
  if (!config.isGrader) return config;

  // Extend fields - only add grader fields not already defined
  const existingFieldNames = config.fields
    ? Object.keys(config.fields).filter(k => k !== 'extend')
    : [];
  const fieldsToAdd = GRADER_FIELDS.filter(f => !existingFieldNames.includes(f));

  let extendedFields = config.fields as Fields | undefined;
  if (fieldsToAdd.length > 0) {
    const newFields = state.fields(fieldsToAdd);
    extendedFields = extendedFields
      ? extendedFields.extend(newFields)
      : newFields;
  }

  // Extend attributes - merge grader attributes by combining shapes
  // Note: We can't use .and() because it fails when schemas contain transforms
  // (e.g., strictBoolean) combined with passthrough. Instead, merge shapes manually.
  let extendedSchema = config.attributes ?? GRADER_ATTRIBUTES;
  if (config.attributes && config.attributes._def?.typeName === 'ZodObject') {
    // Get existing shape and merge with grader attributes shape
    const existingShape = (config.attributes as z.ZodObject<any>).shape;
    const graderShape = GRADER_ATTRIBUTES.shape;
    // Existing attrs take precedence (grader-specific overrides base)
    const mergedShape = { ...graderShape, ...existingShape };
    extendedSchema = z.object(mergedShape).passthrough();
  }

  return {
    ...config,
    fields: extendedFields,
    attributes: extendedSchema,
  };
}

/**
 * Extend config for input blocks.
 * Adds input mixin attributes (slot) for multi-input grader support.
 */
function applyInputExtensions(config: BlueprintInput): BlueprintInput {
  if (!config.isInput) return config;

  // Extend attributes with inputMixin - merge by combining shapes
  const inputShape = inputMixin.shape;
  let extendedSchema = config.attributes ?? baseAttributes.extend(inputShape);
  if (config.attributes && config.attributes._def?.typeName === 'ZodObject') {
    const existingShape = (config.attributes as z.ZodObject<any>).shape;
    // Only add input attrs if not already defined
    const attrsToAdd = Object.fromEntries(
      Object.entries(inputShape).filter(([k]) => !existingShape[k])
    );
    if (Object.keys(attrsToAdd).length > 0) {
      const mergedShape = { ...existingShape, ...attrsToAdd };
      // Preserve strictness - check if original was strict
      const isStrict = config.attributes._def?.unknownKeys === 'strict';
      extendedSchema = isStrict
        ? z.object(mergedShape).strict()
        : z.object(mergedShape).passthrough();
    }
  }

  return {
    ...config,
    attributes: extendedSchema,
  };
}

// Future: applyActionExtensions, etc.

// === Main factory ===
function createBlock(config: BlueprintInput): LoBlock {
  // Apply mixin extensions
  let effectiveConfig = applyGraderExtensions(config);
  effectiveConfig = applyInputExtensions(effectiveConfig);

  // We are using zod primarily for **validation** rather than parsing.
  //
  // Zod will strip away a lot of metadata on functions, react
  // components, etc. in ways which would break the system
  //
  // For a long time, we were very mindful for when we used parsed.X
  // versus config.x, but some of this may need a cleanup still.
  const parsed = BlockBlueprintSchema.parse(effectiveConfig);
  const Component: React.ComponentType<any> = effectiveConfig.component ?? (() => null);

  // === Strict name resolution ===
  const rawName =
    parsed.name ??
    (Component.displayName || Component.name);

  const olxName = (rawName.startsWith('_') ? rawName.slice(1) : rawName) as OLXTag;

  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new Error(
      `createBlock: Could not infer a valid name. You must provide a non-empty 'name' or pass a named component.`
    );
  }

  const block: LoBlock = {
    component: Component,
    _isBlock: true,

    action: effectiveConfig.action,
    parser: effectiveConfig.parser,
    staticKids: effectiveConfig.staticKids,
    reducers: effectiveConfig.reducers ?? [],
    getValue: effectiveConfig.getValue,
    fields: (effectiveConfig.fields as Fields) ?? state.fields([]),
    locals: effectiveConfig.locals ?? {},

    name: rawName,
    OLXName: olxName,
    description: parsed.description,
    namespace: parsed.namespace,
    // TODO: isInput/isMatch currently derived from getValue/locals.match presence.
    // Should be explicit in blueprint for better semantics.
    isInput: typeof effectiveConfig.getValue === 'function',
    isMatch: typeof effectiveConfig.locals?.match === 'function',
    isGrader: parsed.isGrader,
    internal: effectiveConfig.internal,
    category: effectiveConfig.category,
    requiresUniqueId: effectiveConfig.requiresUniqueId,
    attributes: effectiveConfig.attributes,
    validateAttributes: effectiveConfig.validateAttributes,
    requiresGrader: effectiveConfig.requiresGrader,
    getDisplayAnswer: effectiveConfig.getDisplayAnswer,
    slots: effectiveConfig.slots,
    answerDisplayMode: effectiveConfig.answerDisplayMode,
    getDisplayAnswers: effectiveConfig.getDisplayAnswers as LoBlock['getDisplayAnswers'],
  }
  assertUnimplemented(parsed.reducers, 'reducers');

  return block;
}

export const blocks = (namespace: string) =>
  (config: BlueprintReg, locals?: any) =>
    createBlock({ ...config, namespace, locals: locals ?? config.locals });
