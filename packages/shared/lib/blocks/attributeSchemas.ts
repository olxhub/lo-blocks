// src/lib/blocks/attributeSchemas.ts
//
// Attribute schemas for block validation.
//
// Architecture:
//   - baseAttributes: Common to ALL blocks (id, title, class, etc.)
//   - inputMixin: Added by factory when isInput=true
//   - graderMixin: Added by factory when isGrader=true
//   - Optional spreads (placeholder, src): Blocks include manually if needed
//
// Composition happens in factory.tsx based on block properties.
// This allows a block to be input+grader+src without combinatorial explosion.
//
import { z } from 'zod';
import { VALID_ID_SEGMENT, VALID_REDUX_STATE_KEY, toOlxReference, toReduxStateKey } from './idResolver';
import type { OlxReference, ReduxStateKey } from '@/lib/types';
import { parse as parseExpr } from '@/lib/stateLanguage';

/**
 * Zod refinement for validating OLX IDs.
 * Uses the canonical regex from idResolver.ts.
 * Returns undefined if valid, error message if invalid.
 */
const validateOlxId = (id) => {
  if (!id) return undefined;
  if (!VALID_ID_SEGMENT.test(id)) {
    return `ID "${id}" is invalid. IDs must start with a letter or underscore and contain only letters, digits, and underscores.`;
  }
  return undefined;
};

// =============================================================================
// Reusable Value Schemas
// =============================================================================

/**
 * OLX boolean - coerces string "true"/"false" and native booleans to boolean.
 * OLX attributes arrive as strings, so "true" and "false" need coercion.
 * Used in both attribute schemas and field schemas.
 */
export const z_olx_boolean = z.union([z.enum(['true', 'false']), z.boolean()])
  .transform(v => v === 'true' || v === true);

/**
 * OLX number - coerces numeric strings and native numbers to number.
 * OLX attributes and SetFieldAction values arrive as strings.
 */
export const z_olx_number = z.union([z.string(), z.number()])
  .pipe(z.coerce.number());

/**
 * OLX duration - parses human-readable duration strings into seconds.
 * Accepts: "5 minutes", "3 hours", "1 hour 30 minutes", "2 days", or bare numbers.
 */
const DURATION_UNITS = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  d: 86400, day: 86400, days: 86400,
};

function parseDuration(input) {
  const s = String(input).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const pattern = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|sec|minutes?|mins?|min|hours?|hrs?|hr|days?|[smhd])\b/gi;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(pattern)) {
    const value = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (!(unit in DURATION_UNITS)) return NaN;
    total += value * DURATION_UNITS[unit];
    matched = true;
  }
  return matched ? total : NaN;
}

export const z_olx_duration = z.union([z.string(), z.number()])
  .transform(parseDuration)
  .refine(v => !isNaN(v) && v > 0, 'Must be a positive duration (e.g. "5 minutes", "1 hour 30 minutes", "300")');

// =============================================================================
// Reusable ID Schemas
// =============================================================================

/**
 * Ref extractor: given a (possibly transformed) attribute value,
 * returns the block ID strings needed for preloading.
 */
export type RefExtractor = (value: any) => string[];

/**
 * Tag a ref schema's _def with its extractor function.
 * The tag survives .describe() because zod spreads _def when creating copies.
 */
const REF_EXTRACTOR = Symbol('refExtractor');
function tagRefSchema<T extends z.ZodType>(schema: T, extractor: RefExtractor): T {
  (schema as any)._def[REF_EXTRACTOR] = extractor;
  return schema;
}

/** Single OlxKey — bare block ID, no path prefix, no scope. */
export const z_olxKey = tagRefSchema(
  z.string().refine(
    id => VALID_ID_SEGMENT.test(id),
    id => ({ message: `"${id}" is not a valid block ID (must start with letter or underscore, then letters/digits/underscores)` })
  ),
  v => [v],
);

/** Single ReduxStateKey — may include scope markers (e.g. "myList:#0:answer"). */
export const z_reduxStateKey = tagRefSchema(
  z.string().refine(
    key => VALID_REDUX_STATE_KEY.test(key),
    key => ({ message: `"${key}" is not a valid target key` })
  ),
  v => [v],
);

/** Comma-separated ReduxStateKeys — for blocks that accept multiple targets. */
export const z_reduxStateKeyList = tagRefSchema(
  z.string().refine(
    val => val.split(',').map(s => s.trim()).filter(Boolean)
      .every(part => VALID_REDUX_STATE_KEY.test(part)),
    val => ({ message: `target "${val}" contains invalid key(s)` })
  ),
  v => typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [],
);

// -----------------------------------------------------------------------------
// Block.field references — transform to { ref: ReduxStateKey, field: string }
// -----------------------------------------------------------------------------

export type BlockFieldRef = { ref: ReduxStateKey; field: string };

/**
 * Split "blockId.fieldName" into { ref: ReduxStateKey, field }.
 * If no .field suffix, defaults field to 'value'.
 *
 * The ref is a ReduxStateKey (e.g. "foo", "list:#0:item") — used directly
 * for Redux state access without re-scoping.
 */
function splitFieldRef(val: string): BlockFieldRef {
  const dot = val.lastIndexOf('.');
  if (dot >= 0) {
    const fieldPart = val.substring(dot + 1);
    if (VALID_ID_SEGMENT.test(fieldPart)) {
      const base = val.substring(0, dot);
      if (VALID_REDUX_STATE_KEY.test(base)) {
        return { ref: toReduxStateKey(base), field: fieldPart };
      }
    }
  }
  return { ref: toReduxStateKey(val), field: 'value' };
}

/** Single block.field reference. Transforms to { ref: ReduxStateKey, field: string }. */
export const z_blockFieldRef = tagRefSchema(
  z.union([
    z.string().transform(splitFieldRef),
    z.object({ ref: z.custom<ReduxStateKey>(), field: z.string() }),
  ]),
  v => typeof v === 'object' && v?.ref ? [String(v.ref)] : [],
);

/** Comma-separated block.field references. Transforms to BlockFieldRef[]. */
export const z_blockFieldRefList = tagRefSchema(
  z.union([
    z.string().transform((val): BlockFieldRef[] =>
      val.split(',').map(s => s.trim()).filter(Boolean).map(splitFieldRef)
    ),
    z.array(z.object({ ref: z.custom<ReduxStateKey>(), field: z.string() })),
  ]),
  v => Array.isArray(v) ? v.map(item => String(item.ref)).filter(Boolean) : [],
);

// =============================================================================
// Block Reference Detection
// =============================================================================
//
// Each ref schema is tagged (via _def) with an extractor function that knows
// how to pull block IDs from the (possibly transformed) attribute value.
// ensureReferencedBlocks (in useOlxJson.ts) uses these to discover which
// attributes need preloading — instead of hardcoding attribute names.
//
// The tag lives on _def so it survives .describe() (which spreads _def).
// unwrapSchema strips .optional()/.nullable()/.default() to reach the tag.

/** Unwrap zod wrappers (optional, nullable, default) to find the inner schema. */
function unwrapSchema(schema: z.ZodType): z.ZodType {
  const def = (schema as any)._def;
  if (def?.typeName === 'ZodOptional' || def?.typeName === 'ZodNullable') {
    return unwrapSchema(def.innerType);
  }
  if (def?.typeName === 'ZodDefault') {
    return unwrapSchema(def.innerType);
  }
  return schema;
}

/**
 * Returns the attribute names in a zod object schema that contain
 * block references, along with extractor functions for each.
 *
 * Used by ensureReferencedBlocks to discover which attributes to scan
 * for preloading.
 */
export function getRefAttributes(attributeSchema: z.ZodType): Array<{ name: string, extractRefs: RefExtractor }> {
  const def = (attributeSchema as any)._def;
  // Handle .strict() / .passthrough() — they wrap the inner ZodObject
  if (def?.typeName === 'ZodEffects' || def?.typeName === 'ZodPipeline') {
    return getRefAttributes(def.schema ?? def.in);
  }
  if (def?.typeName !== 'ZodObject') return [];
  const shape = (attributeSchema as z.ZodObject<any>).shape;
  const refs: Array<{ name: string, extractRefs: RefExtractor }> = [];
  for (const [name, schema] of Object.entries(shape)) {
    const extractor = (unwrapSchema(schema as z.ZodType) as any)._def?.[REF_EXTRACTOR];
    if (extractor) {
      refs.push({ name, extractRefs: extractor });
    }
  }
  return refs;
}

// =============================================================================
// Base Attributes (all blocks)
// =============================================================================

/**
 * Base attributes common to all blocks.
 * STRICT: unknown attributes cause validation errors.
 */
export const baseAttributes = z.object({
  id: z.string().optional().refine(
    (id) => !id || VALID_ID_SEGMENT.test(id),
    (id) => ({ message: validateOlxId(id) })
  ).describe('Unique identifier (letter or underscore start, then letters/digits/underscores)'),
  title: z.string().optional().describe('Display title (shown in tabs, course navigation, headers)'),
  class: z.string().optional().describe('Visual styling classes (CSS classes for developers)'),
  launchable: z.string().optional().describe('Set to "true" to show in activity indexes'),
  initialPosition: z.coerce.number().optional().describe('Initial position for sortable items (1-indexed)'),
  lang: z.string().optional().describe('BCP 47 language tag (e.g., en-Latn-US, ar-Arab-SA). Overrides parent and file-level language.'),
  when: z.union([
    z.string().transform(expr => ({ expr, ast: parseExpr(expr) })),
    z.object({ expr: z.string(), ast: z.any() }),
  ]).optional()
    .describe('State-language expression controlling visibility (e.g. "@quiz.correct === correctness.correct")'),
}).strict();

// =============================================================================
// Mixins (composed by factory based on block type)
// =============================================================================

/**
 * Input mixin - added by factory when isInput=true.
 * Contains attributes specific to input blocks.
 */
export const inputMixin = z.object({
  slot: z.string().optional().describe('Named slot for multi-input graders (e.g., "numerator")'),
});

/**
 * Grader mixin - added by factory when isGrader=true.
 * Contains attributes specific to grader blocks.
 */
export const graderMixin = z.object({
  answer: z.string().optional().describe('Expected answer for grading'),
  displayAnswer: z.string().optional().describe('Answer shown to student (may differ from grading answer)'),
  target: z_reduxStateKeyList.optional().describe('Target input ID(s) to grade, comma-separated for multi-input graders (inferred if omitted)'),
});

// =============================================================================
// Problem Mode Attributes (shared by CapaProblem, MarkupProblem, etc.)
// =============================================================================

/**
 * Valid showanswer modes - when the Show Answer button becomes available.
 */
export const showAnswerModes = [
  'always',     // Always visible
  'never',      // Never visible
  'attempted',  // After first attempt (submitCount > 0)
  'answered',   // After correct answer
  'closed',     // After attempts exhausted (submitCount >= maxAttempts)
  'finished',   // answered OR closed (default)
] as const;

export type ShowAnswerMode = typeof showAnswerModes[number];

/**
 * Schema for showanswer attribute - validates against allowed modes.
 */
export const showAnswerAttr = z.enum(showAnswerModes).optional()
  .describe('When to show answer: always, never, attempted, answered, closed, finished');

/**
 * Schema for maxAttempts attribute - positive integer string or empty for unlimited.
 */
export const maxAttemptsAttr = z.string()
  .regex(/^(\d+)?$/, 'Must be a positive integer or empty for unlimited')
  .optional()
  .describe('Maximum submission attempts (empty = unlimited)');

/**
 * Problem mixin - added to problem container blocks.
 * Contains attributes for attempts and answer visibility.
 */
export const problemMixin = z.object({
  maxAttempts: maxAttemptsAttr,
  showanswer: showAnswerAttr,
});

// =============================================================================
// Optional Spreads (blocks include manually if needed)
// =============================================================================

/**
 * Placeholder attribute - for blocks that support placeholder text.
 * Usage: baseAttributes.extend({ ...placeholder, myAttr: z.string() })
 */
export const placeholder = {
  placeholder: z.string().optional().describe('Placeholder text displayed when empty'),
};

/**
 * Src attribute - for blocks that load external content.
 * Usage: baseAttributes.extend({ ...src, myAttr: z.string() })
 */
export const src = {
  src: z.string().optional().describe('Path to external file containing content'),
};

// =============================================================================
// Legacy Exports (deprecated - use baseAttributes + mixins)
// =============================================================================

// TODO: Remove these after updating all block files
// These pre-composed schemas don't handle composition well

/** @deprecated Use baseAttributes.extend({...src}) instead */
export const srcAttributes = baseAttributes.extend(src);

/** @deprecated Factory now handles input attrs via isInput flag */
export const inputAttributes = baseAttributes.extend(inputMixin.shape);

/** @deprecated Factory now handles grader attrs via isGrader flag */
export const graderAttributes = baseAttributes.extend(graderMixin.shape);

/** @deprecated Use inputMixin.shape instead */
export const slot = inputMixin.shape;

/** Inferred type for grader attributes */
export type GraderAttributes = z.infer<typeof graderMixin>;
