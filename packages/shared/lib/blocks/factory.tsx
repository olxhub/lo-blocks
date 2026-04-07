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
import { baseAttributes, inputAttributes, graderAttributes } from './attributeSchemas';
import * as state from '@/lib/state';

function assertUnimplemented<T>(field: T | undefined, fieldName: string) {
  if (field !== undefined && field !== null) {
    throw new Error(`createBlock: '${fieldName}' is not yet implemented.`);
  }
}

// === Mixin composition ===
//
// A block config may carry `parserMixin`, `inputMixin`, or `graderMixin`
// keys, each of which is itself a partial BlueprintInput. Layers compose
// in a fixed order:
//
//   parser → input → grader → blueprint
//
// For most keys, the later layer wins. For `fields` and `attributes`,
// layers accumulate and duplicates raise. For `locals`, layers merge
// per-child key (later wins, no error).
//
// The mixin keys are stripped from the config before it reaches
// BlockBlueprintSchema, so the schema (and LoBlock) never see them.
//
// See plan: .claude/plans/enchanted-swimming-ladybug.md

/** A partial blueprint that mixin layers accept. Everything is optional. */
type MixinLayer = Partial<BlueprintInput>;

/** Input config to createBlock, including the optional mixin keys. */
type BlueprintInputWithMixins = BlueprintInput & {
  parserMixin?: MixinLayer;
  inputMixin?: MixinLayer;
  graderMixin?: MixinLayer;
};

/**
 * Build the friendly forward-looking conflict message used for both fields
 * and attributes collisions.
 */
function mixinConflictMessage(
  blockName: string,
  kind: 'attribute' | 'field',
  key: string,
  layerA: string,
  layerB: string,
): string {
  return (
    `createBlock(${blockName}): mixin composition conflict. ` +
    `${kind === 'attribute' ? 'Attribute' : 'Field'} \`${key}\` is defined by ` +
    `both \`${layerA}\` and \`${layerB}\`. We currently raise on duplicate ` +
    `fields/attributes because in 99% of cases this is a bug. If this ` +
    `override is intentional, the planned \`allowOverrides: true\` flag on ` +
    `the later layer will silence this error — leave a comment and ping ` +
    `the core team if you hit this case.`
  );
}

/**
 * Merge two ZodObject attribute schemas, raising on shape-key collision.
 * Strictness is preserved: strict beats passthrough.
 */
function mergeAttributes(
  a: z.ZodTypeAny | undefined,
  b: z.ZodTypeAny | undefined,
  blockName: string,
  layerA: string,
  layerB: string,
): z.ZodTypeAny | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a._def?.typeName !== 'ZodObject' || b._def?.typeName !== 'ZodObject') {
    throw new Error(
      `createBlock(${blockName}): mixin composition requires ZodObject ` +
      `attribute schemas; got ${a._def?.typeName} and ${b._def?.typeName} ` +
      `from layers \`${layerA}\` and \`${layerB}\`.`
    );
  }
  const shapeA = (a as z.ZodObject<any>).shape;
  const shapeB = (b as z.ZodObject<any>).shape;
  const merged: Record<string, z.ZodTypeAny> = { ...shapeA };
  for (const key of Object.keys(shapeB)) {
    if (key in shapeA) {
      throw new Error(mixinConflictMessage(blockName, 'attribute', key, layerA, layerB));
    }
    merged[key] = shapeB[key];
  }
  const aStrict = a._def?.unknownKeys === 'strict';
  const bStrict = b._def?.unknownKeys === 'strict';
  return (aStrict || bStrict)
    ? z.object(merged).strict()
    : z.object(merged).passthrough();
}

/** Extract FieldInfo values from a Fields object (skipping `extend`). */
function fieldInfosFromFields(f: Fields): any[] {
  return Object.values(f).filter(
    (v: any) => v && typeof v === 'object' && v.type === 'field'
  );
}

/**
 * Merge two Fields objects, raising on duplicate field name.
 * Delegates to state.fields to produce a fresh Fields with a working extend().
 */
function mergeFields(
  a: Fields | undefined,
  b: Fields | undefined,
  blockName: string,
  layerA: string,
  layerB: string,
): Fields | undefined {
  if (!a) return b;
  if (!b) return a;
  const fieldsA = fieldInfosFromFields(a);
  const fieldsB = fieldInfosFromFields(b);
  const namesA = new Set(fieldsA.map(f => f.name));
  for (const f of fieldsB) {
    if (namesA.has(f.name)) {
      throw new Error(mixinConflictMessage(blockName, 'field', f.name, layerA, layerB));
    }
  }
  return state.fields([...fieldsA, ...fieldsB] as any);
}

/** Merge locals per-key. Later wins per child key. No error on conflict. */
function mergeLocals(
  a: Record<string, any> | undefined,
  b: Record<string, any> | undefined,
): Record<string, any> | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

/**
 * Compose a sequence of partial blueprint layers into a single effective
 * config. Most keys use later-wins override. `fields` and `attributes`
 * accumulate and raise on duplicates. `locals` merges per-key.
 *
 * `layerNames[i]` parallels `layers[i]` and is used only for error messages.
 */
function composeBlueprint(
  layers: (MixinLayer | undefined)[],
  layerNames: string[],
  blockName: string,
): BlueprintInput {
  const result: Record<string, any> = {};
  // Track which layer last contributed each accumulating key so the
  // conflict message names the right two layers.
  const lastSource: { fields?: string; attributes?: string } = {};

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerName = layerNames[i];
    if (!layer) continue;

    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;

      if (key === 'fields') {
        result.fields = mergeFields(
          result.fields as Fields | undefined,
          value as Fields,
          blockName,
          lastSource.fields ?? '(previous layer)',
          layerName,
        );
        lastSource.fields = layerName;
      } else if (key === 'attributes') {
        result.attributes = mergeAttributes(
          result.attributes as z.ZodTypeAny | undefined,
          value as z.ZodTypeAny,
          blockName,
          lastSource.attributes ?? '(previous layer)',
          layerName,
        );
        lastSource.attributes = layerName;
      } else if (key === 'locals') {
        result.locals = mergeLocals(
          result.locals as Record<string, any> | undefined,
          value as Record<string, any>,
        );
      } else {
        // All other keys: later wins.
        result[key] = value;
      }
    }
  }

  return result as BlueprintInput;
}

// === Mixin extensions ===
// These functions extend config based on mixin flags (isGrader, isInput, etc.)

// Standard attributes for graders - uses graderAttributes from attributeSchemas
// passthrough preserves additional attrs (like src for PEG parsers)
const GRADER_ATTRIBUTES = baseAttributes.extend(graderAttributes.shape).passthrough();

/**
 * Extend config for grader blocks.
 * Adds standard attributes (answer, displayAnswer, target).
 *
 * Fields are NOT auto-added — graders should declare them explicitly
 * via graderFields() in their field definitions.
 */
function applyGraderExtensions(config: BlueprintInput): BlueprintInput {
  if (!config.isGrader) return config;

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
    attributes: extendedSchema,
  };
}

/**
 * Extend config for input blocks.
 * Adds input mixin attributes (slot) for multi-input grader support.
 */
function applyInputExtensions(config: BlueprintInput): BlueprintInput {
  if (!config.isInput) return config;

  // Extend attributes with inputAttributes - merge by combining shapes
  const inputShape = inputAttributes.shape;
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
function createBlock(config: BlueprintInputWithMixins): LoBlock {
  // Step 1: Strip mixin keys and compose them if any are present.
  // The three mixin keys are peeled off first because BlockBlueprintSchema
  // doesn't know about them (the plan keeps the schema clean).
  const { parserMixin, inputMixin, graderMixin, ...blueprintLayer } = config;
  const hasMixins = parserMixin || inputMixin || graderMixin;

  let effectiveConfig: BlueprintInput;
  if (hasMixins) {
    const blockName = (blueprintLayer as BlueprintInput).name ?? '(unknown)';
    effectiveConfig = composeBlueprint(
      [parserMixin, inputMixin, graderMixin, blueprintLayer as MixinLayer],
      ['parserMixin', 'inputMixin', 'graderMixin', 'blueprint'],
      blockName,
    );
  } else {
    effectiveConfig = blueprintLayer as BlueprintInput;
  }

  // Step 2: Apply legacy isInput/isGrader-driven extensions (unchanged).
  effectiveConfig = applyGraderExtensions(effectiveConfig);
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
    selectValue: effectiveConfig.selectValue,
    fields: (effectiveConfig.fields as Fields) ?? state.fields([]),
    locals: effectiveConfig.locals ?? {},

    name: olxName,
    description: parsed.description,
    namespace: parsed.namespace,
    isInput: parsed.isInput,
    isMatch: typeof effectiveConfig.locals?.match === 'function',
    isGrader: parsed.isGrader,
    internal: effectiveConfig.internal,
    category: effectiveConfig.category,
    requiresUniqueId: effectiveConfig.requiresUniqueId,
    attributes: effectiveConfig.attributes,
    validateAttributes: effectiveConfig.validateAttributes,
    validateChildren: effectiveConfig.validateChildren,
    valueSchema: effectiveConfig.valueSchema,
    inputSchema: effectiveConfig.inputSchema,
    requiresGrader: effectiveConfig.requiresGrader,
    getDisplayAnswer: effectiveConfig.getDisplayAnswer,
    slots: effectiveConfig.slots,
    answerDisplayMode: effectiveConfig.answerDisplayMode,
    getDisplayAnswers: effectiveConfig.getDisplayAnswers as LoBlock['getDisplayAnswers'],
  }
  // Validate requiresUniqueId at block registration time so block authors
  // get an early error, not course authors hitting it at content parse time.
  // (Defense-in-depth: the Zod schema also constrains this, but runtime
  // validation catches cases where the schema isn't the gatekeeper.)
  const ruid = effectiveConfig.requiresUniqueId;
  if (ruid !== undefined && typeof ruid !== 'boolean') {
    throw new Error(`createBlock(${olxName}): requiresUniqueId must be boolean, got ${JSON.stringify(ruid)}`);
  }

  assertUnimplemented(parsed.reducers, 'reducers');

  // Default selectValue for input blocks: read commonFields.value
  if (block.isInput && !block.selectValue) {
    block.selectValue = (props, reduxState, id) =>
      state.fieldSelector(reduxState, { ...props, id }, state.commonFields.value, { fallback: '' });
  }

  return block;
}

type BlueprintRegWithMixins = BlueprintReg & {
  parserMixin?: MixinLayer;
  inputMixin?: MixinLayer;
  graderMixin?: MixinLayer;
};

export const blocks = (namespace: string) =>
  (config: BlueprintRegWithMixins, locals?: any) =>
    createBlock({ ...config, namespace, locals: locals ?? config.locals });
