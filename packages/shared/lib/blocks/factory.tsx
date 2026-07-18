// packages/shared/lib/blocks/factory.tsx
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
import { baseAttributes } from './attributeSchemas';
import { assertNotReserved } from '../stateLanguage/keywords';

// Factory-local type aliases derived from the schema
type BlueprintInput = z.input<typeof BlockBlueprintSchema>;
type BlueprintReg = Omit<BlueprintInput, "namespace">;
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
// in a fixed order, with `baseAttributes` always silently prepended:
//
//   baseAttributes → parser → input → grader → blueprint
//
// `baseAttributes` is implicit so individual blocks no longer need to
// write `baseAttributes.extend({...})`. Just declare your own attribute
// shape (`z.object({...}).strict()`) and the factory merges in the
// common base keys (id, title, class, when, popout, …) for you.
//
// For most keys, the later layer wins. For `fields` and `attributes`,
// layers accumulate and duplicates raise. For `locals`, layers merge
// per-child key (later wins, no error).
//
// The mixin keys are stripped from the config before it reaches
// BlockBlueprintSchema, so the schema (and LoBlock) never see them.
//
// See plan: .claude/plans/enchanted-swimming-ladybug.md

/**
 * A partial blueprint that mixin layers accept. Everything is optional.
 *
 * `allowOverrides` is an explicit allow-list of field/attribute names this
 * layer is intentionally redefining. When a later layer names a key in its
 * `allowOverrides`, colliding keys from earlier layers are replaced
 * silently instead of raising. This is a narrow, per-key escape hatch —
 * there is deliberately no blanket `allowOverrides: true`.
 */
type MixinLayer = Partial<BlueprintInput> & {
  allowOverrides?: string[];
};

/**
 * Shared shape of the optional mixin/override keys that `createBlock` and
 * `blocks(namespace)` both accept on top of their core blueprint type.
 *
 * The `acceptsUnknownAttributes` flag is an escape hatch for template
 * blocks that receive attributes whose names are determined by user
 * content at runtime. Navigator's preview/detail templates are the
 * canonical case: their parent injects per-item data fields (from
 * user-authored YAML) as attributes, so the set of allowed attribute
 * names isn't knowable at block-definition time.
 *
 * When `acceptsUnknownAttributes` is true:
 *   - the implicit baseAttributes layer is NOT prepended
 *   - the block's effective attribute schema is `z.object({}).passthrough()`
 *
 * This bypasses strict validation entirely, so reach for it only when
 * the block's *purpose* is to accept attributes whose names cannot be
 * declared up front.
 *
 * TODO (tech debt): ErrorNode currently uses this flag because it
 * inherits arbitrary attributes from failed source nodes. That is a
 * legacy accommodation — ErrorNode should declare a real, strict schema
 * for what it actually needs to render an error (name, message,
 * technicalDetails, source, etc.) and discard the rest. Migrate when
 * the error-rendering path gets its next pass.
 */
type WithMixins<T> = T & {
  parserMixin?: MixinLayer;
  inputMixin?: MixinLayer;
  graderMixin?: MixinLayer;
  allowOverrides?: string[];
  acceptsUnknownAttributes?: boolean;
};

/** Input config to createBlock, including the optional mixin keys. */
type BlueprintInputWithMixins = WithMixins<BlueprintInput>;

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
    `both \`${layerA}\` and \`${layerB}\`. We raise on duplicate ` +
    `fields/attributes because in 99% of cases this is a bug. If this ` +
    `override is intentional, add \`allowOverrides: ['${key}']\` to the ` +
    `\`${layerB}\` layer to silence this error.`
  );
}

/**
 * Merge two ZodObject attribute schemas, raising on shape-key collision.
 *
 * The merged schema is always `.strict()`. Any block that genuinely needs
 * to accept extra attributes must declare them explicitly in its own
 * attribute shape — there is no longer a `.passthrough()` escape hatch
 * surviving composition.
 */
function mergeAttributes(
  a: z.ZodTypeAny | undefined,
  b: z.ZodTypeAny | undefined,
  blockName: string,
  layerA: string,
  layerB: string,
  allowOverrides: string[],
): z.ZodTypeAny | undefined {
  if (!a) return b;
  if (!b) return a;
  if (!(a instanceof z.ZodObject) || !(b instanceof z.ZodObject)) {
    throw new Error(
      `createBlock(${blockName}): mixin composition requires ZodObject ` +
      `attribute schemas from layers \`${layerA}\` and \`${layerB}\`.`
    );
  }
  const shapeA = a.shape;
  const shapeB = b.shape;
  const merged: Record<string, z.ZodTypeAny> = { ...shapeA };
  for (const key of Object.keys(shapeB)) {
    if (key in shapeA && !allowOverrides.includes(key)) {
      throw new Error(mixinConflictMessage(blockName, 'attribute', key, layerA, layerB));
    }
    // Later layer wins (either no collision, or collision was explicitly allowed).
    merged[key] = shapeB[key];
  }
  return z.object(merged).strict();
}

/**
 * Merge two Fields objects, raising on duplicate field name.
 *
 * A direct object merge isn't enough because each `Fields` carries an
 * `extend` method that closes over its originating field set. To get a
 * merged result with a coherent `extend`, we pull the raw FieldInfo lists
 * out with `state.fieldInfosFrom` and feed the concatenation back through
 * `state.fields(...)`.
 *
 * Names listed in `allowOverrides` are intentional replacements: the
 * corresponding entries from `a` are dropped so `state.fields`' own
 * duplicate-name guard doesn't fire when we append `b`.
 */
function mergeFields(
  a: Fields | undefined,
  b: Fields | undefined,
  blockName: string,
  layerA: string,
  layerB: string,
  allowOverrides: string[],
): Fields | undefined {
  if (!a) return b;
  if (!b) return a;
  const fieldsA = state.fieldInfosFrom(a);
  const fieldsB = state.fieldInfosFrom(b);
  const namesA = new Set(fieldsA.map(f => f.name));
  const overrideNames = new Set<string>();
  for (const f of fieldsB) {
    if (namesA.has(f.name)) {
      if (!allowOverrides.includes(f.name)) {
        throw new Error(mixinConflictMessage(blockName, 'field', f.name, layerA, layerB));
      }
      overrideNames.add(f.name);
    }
  }
  const keptA = fieldsA.filter(f => !overrideNames.has(f.name));
  return state.fields([...keptA, ...fieldsB]);
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

    // A layer's `allowOverrides` applies when that layer's own keys collide
    // with entries already accumulated from earlier layers.
    const layerAllowOverrides = layer.allowOverrides ?? [];

    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      // allowOverrides is a directive for the merge logic, not a blueprint
      // field. Strip it so it never reaches BlockBlueprintSchema (strict).
      if (key === 'allowOverrides') continue;

      if (key === 'fields') {
        result.fields = mergeFields(
          result.fields as Fields | undefined,
          value as Fields,
          blockName,
          lastSource.fields ?? '(previous layer)',
          layerName,
          layerAllowOverrides,
        );
        lastSource.fields = layerName;
      } else if (key === 'attributes') {
        result.attributes = mergeAttributes(
          result.attributes as z.ZodTypeAny | undefined,
          value as z.ZodTypeAny,
          blockName,
          lastSource.attributes ?? '(previous layer)',
          layerName,
          layerAllowOverrides,
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

// === Main factory ===
function createBlock(config: BlueprintInputWithMixins): LoBlock {
  // Step 1: Strip mixin keys and compose. The three mixin keys are peeled
  // off first because BlockBlueprintSchema doesn't know about them.
  // baseAttributes is silently prepended as an implicit first layer so
  // every block automatically validates against the common base keys —
  // individual blocks no longer write `baseAttributes.extend({...})`.
  const {
    parserMixin,
    inputMixin,
    graderMixin,
    acceptsUnknownAttributes,
    ...blueprintLayer
  } = config;
  const blockName = (blueprintLayer as BlueprintInput).name ?? '(unknown)';

  // Fallback blocks (ErrorNode) opt out of the implicit baseAttributes
  // layer and end up with a wide-open passthrough schema.
  const layers: (MixinLayer | undefined)[] = acceptsUnknownAttributes
    ? [parserMixin, inputMixin, graderMixin, blueprintLayer as MixinLayer]
    : [
        { attributes: baseAttributes },
        parserMixin,
        inputMixin,
        graderMixin,
        blueprintLayer as MixinLayer,
      ];
  const layerNames = acceptsUnknownAttributes
    ? ['parserMixin', 'inputMixin', 'graderMixin', 'blueprint']
    : ['baseAttributes', 'parserMixin', 'inputMixin', 'graderMixin', 'blueprint'];

  const effectiveConfig: BlueprintInput = composeBlueprint(layers, layerNames, blockName);
  if (acceptsUnknownAttributes) {
    effectiveConfig.attributes = z.object({}).passthrough();
  }

  // Validate attribute names against reserved expression-language keywords.
  // This catches collisions at block-definition time rather than leaving
  // ambiguous semantics for content authors.
  if (effectiveConfig.attributes instanceof z.ZodObject) {
    for (const key of Object.keys(effectiveConfig.attributes.shape)) {
      assertNotReserved(key, `createBlock(${blockName})`);
    }
  }

  // We are using zod primarily for **validation** rather than parsing.
  //
  // Zod will strip away a lot of metadata on functions, react
  // components, etc. in ways which would break the system
  //
  // For a long time, we were very mindful for when we used parsed.X
  // versus config.x, but some of this may need a cleanup still.
  const parsed = BlockBlueprintSchema.parse(effectiveConfig);

  // component (eager, same-module) and componentLoader (lazy, code-split)
  // are alternatives — see ComponentLoader in lib/types/core.ts. Blocks with
  // neither are headless (or get the conventional `_Name` loader wired by
  // the registry generator).
  if (effectiveConfig.component && effectiveConfig.componentLoader) {
    throw new Error(
      `createBlock(${blockName}): declare 'component' (eager) or ` +
      `'componentLoader' (lazy) — not both. Drop 'component' unless the ` +
      `component must load with the blueprint.`
    );
  }
  const Component = effectiveConfig.component;

  // === Strict name resolution ===
  const rawName =
    parsed.name ??
    (Component && (Component.displayName || Component.name));

  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw new Error(
      `createBlock: Could not infer a valid name. You must provide a non-empty 'name' or pass a named component.`
    );
  }

  const olxName = (rawName.startsWith('_') ? rawName.slice(1) : rawName) as OLXTag;

  const block: LoBlock = {
    component: Component,
    componentLoader: effectiveConfig.componentLoader,
    ensureReady: effectiveConfig.ensureReady,
    _isBlock: true,

    action: effectiveConfig.action,
    parser: effectiveConfig.parser,
    staticKids: effectiveConfig.staticKids as LoBlock['staticKids'],
    reducers: effectiveConfig.reducers ?? [],
    advance: effectiveConfig.advance as LoBlock['advance'],
    canAdvance: effectiveConfig.canAdvance as LoBlock['canAdvance'],
    fields: (effectiveConfig.fields as Fields) ?? state.fields([]),
    locals: effectiveConfig.locals ?? {},

    name: olxName,
    description: parsed.description,
    namespace: parsed.namespace,
    isInput: parsed.isInput,
    isMatch: typeof effectiveConfig.locals?.match === 'function',
    isGrader: parsed.isGrader,
    selectors: effectiveConfig.selectors,
    setters: effectiveConfig.setters,
    grading: effectiveConfig.grading,
    commitOnChange: parsed.commitOnChange,
    internal: effectiveConfig.internal,
    prototype: effectiveConfig.prototype,
    category: effectiveConfig.category,
    requiresUniqueId: effectiveConfig.requiresUniqueId,
    childMode: effectiveConfig.childMode,
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
    grammars: effectiveConfig.grammars,
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

  // Default value getter for input blocks: the decoded commonFields.value.
  // Level 2 (not 3): this getter IS the block's value getter, so it must read
  // its own backing store — a level-3 read would re-enter itself. Decoded so
  // docField-valued inputs yield their string, not the raw RgaDoc.
  if (block.isInput && !block.selectors?.value) {
    block.selectors = {
      ...block.selectors,
      value: (reduxState, props, id) =>
        state.decodedFieldSelector(reduxState, { ...props, id }, state.commonFields.value, { fallback: '' }),
    };
  }

  return block;
}

type BlueprintRegWithMixins = WithMixins<BlueprintReg>;

export const blocks = (namespace: string) =>
  (config: BlueprintRegWithMixins, locals?: any) =>
    createBlock({ ...config, namespace, locals: locals ?? config.locals });
