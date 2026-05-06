// src/lib/blocks/attributeSchemas.ts
//
// Attribute schemas for block validation.
//
// Architecture:
//   - baseAttributes: Common to ALL blocks (id, title, class, etc.)
//   - inputAttributes: Added by factory when isInput=true
//   - graderAttributes: Added by factory when isGrader=true
//   - Optional spreads (placeholder, src): Blocks include manually if needed
//
// Composition happens in factory.tsx based on block properties.
// This allows a block to be input+grader+src without combinatorial explosion.
//
import { z } from 'zod';
import { VALID_ID_SEGMENT, VALID_REDUX_STATE_REF, toOlxReference, parseReduxStateRef } from '../types/id';
import { z_locale } from '../types/i18n';
import type { OlxReference, ReduxStateRef } from '@/lib/types';
import { parse as parseExpr } from '@/lib/stateLanguage';
import { CastSchema, Face, AvatarStyle } from '@/lib/avatar/types';

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

/**
 * Pre-parsed expression: string → { expr, ast }. Idempotent (accepts already-parsed objects).
 * Used for visibility conditions (when=) and grading expressions (Rule match=).
 */
export const z_expression = z.union([
  z.string().transform(expr => ({ expr, ast: parseExpr(expr) })),
  z.object({ expr: z.string(), ast: z.any() }),
]);

/**
 * Trigger mode: "once" fires the first time only, "each" fires every transition.
 * Shared by OnShow, Trigger, and future trigger-like blocks.
 */
export const z_triggerMode = z.enum(['once', 'each']).default('once');

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
  ).transform(id => id as unknown as OlxReference & { readonly __resolved: true }),
  v => [v],
);

function hasReduxStateRefShape(input: string): boolean {
  try {
    parseReduxStateRef(input);
    return true;
  } catch {
    return false;
  }
}

/** Single ReduxStateRef — authored target ref, may include scope markers (e.g. "myList:#0:answer"). */
export const z_reduxStateRef = tagRefSchema(
  z.string().refine(
    key => hasReduxStateRefShape(key),
    key => ({ message: `"${key}" is not a valid target ref` })
  ).transform(key => parseReduxStateRef(key)),
  v => [v],
);

/** Comma-separated ReduxStateRefs → ReduxStateRef[]. Idempotent (accepts already-split arrays). */
export const z_reduxStateRefList = tagRefSchema(
  z.union([
    z.string().transform(val => val.split(',').map(s => s.trim()).filter(Boolean))
      .refine(
        parts => parts.every(hasReduxStateRefShape),
        parts => ({ message: `target contains invalid ref(s): ${parts.filter(p => !hasReduxStateRefShape(p)).join(', ')}` })
      )
      .transform(parts => parts.map(part => parseReduxStateRef(part))),
    z.array(z.string())
      .refine(
        parts => parts.every(hasReduxStateRefShape),
        parts => ({ message: `target contains invalid ref(s): ${parts.filter(p => !hasReduxStateRefShape(p)).join(', ')}` })
      )
      .transform(parts => parts.map(part => parseReduxStateRef(part))),
  ]),
  v => typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(v) ? v : [],
);

// -----------------------------------------------------------------------------
// Block.field references — transform to { ref: ReduxStateRef, field: string }
// -----------------------------------------------------------------------------

export type BlockFieldRef = { ref: ReduxStateRef; field: string };

/**
 * Split "blockId.fieldName" into { ref: ReduxStateRef, field }.
 * If no .field suffix, defaults field to 'value'.
 *
 * The ref is an authored ReduxStateRef (e.g. "foo", "list:#0:item").
 * Runtime consumers resolve it with refToReduxKey() before Redux lookup.
 */
function splitFieldRef(val: string): BlockFieldRef {
  const dot = val.lastIndexOf('.');
  if (dot >= 0) {
    const fieldPart = val.substring(dot + 1);
    if (VALID_ID_SEGMENT.test(fieldPart)) {
      const base = val.substring(0, dot);
      if (VALID_REDUX_STATE_REF.test(base)) {
        return { ref: parseReduxStateRef(base), field: fieldPart };
      }
    }
  }
  return { ref: parseReduxStateRef(val), field: 'value' };
}

/** Single block.field reference. Transforms to { ref: ReduxStateRef, field: string }. */
export const z_blockFieldRef = tagRefSchema(
  z.union([
    z.string().transform(splitFieldRef),
    z.object({ ref: z.custom<ReduxStateRef>(), field: z.string() }),
  ]),
  v => typeof v === 'string' ? [splitFieldRef(v).ref] : (v?.ref ? [String(v.ref)] : []),
);

/** Comma-separated block.field references. Transforms to BlockFieldRef[]. */
export const z_blockFieldRefList = tagRefSchema(
  z.union([
    z.string().transform((val): BlockFieldRef[] =>
      val.split(',').map(s => s.trim()).filter(Boolean).map(splitFieldRef)
    ),
    z.array(z.object({ ref: z.custom<ReduxStateRef>(), field: z.string() })),
  ]),
  v => typeof v === 'string'
    ? v.split(',').map(s => s.trim()).filter(Boolean).map(s => splitFieldRef(s).ref)
    : Array.isArray(v) ? v.map(item => String(item.ref)).filter(Boolean) : [],
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
  lang: z_locale.optional().describe('BCP 47 language tag (e.g., en-Latn-US, ar-Arab-SA). Overrides parent and file-level language.'),
  when: z_expression.optional()
    .describe('State-language expression controlling visibility (e.g. "@quiz.correct === correctness.correct")'),
  popout: z.enum([
    'window', 'fullscreen',
    'window:tl', 'window:tr', 'window:bl', 'window:br',
    'fullscreen:tl', 'fullscreen:tr', 'fullscreen:bl', 'fullscreen:br',
  ]).optional()
    .describe('Pop-out mode: "window" or "fullscreen", with optional button position (:tl, :tr, :bl, :br)'),
}).strict();

// =============================================================================
// Mixins (composed by factory based on block type)
// =============================================================================

/**
 * Input attributes - added by factory when isInput=true.
 * Contains attributes specific to input blocks.
 */
export const inputAttributes = z.object({
  slot: z.string().optional().describe('Named slot for multi-input graders (e.g., "numerator")'),
});

/**
 * Grader attributes - added by factory when isGrader=true.
 * Contains attributes specific to grader blocks.
 */
export const graderAttributes = z.object({
  answer: z.string().optional().describe('Expected answer for grading'),
  displayAnswer: z.string().optional().describe('Answer shown to student (may differ from grading answer)'),
  target: z_reduxStateRefList.optional().describe('Target input ID(s) to grade, comma-separated for multi-input graders (inferred if omitted)'),
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
 * Problem attributes - added to problem container blocks.
 * Contains attributes for attempts and answer visibility.
 */
export const problemAttributes = z.object({
  maxAttempts: maxAttemptsAttr,
  showanswer: showAnswerAttr,
});

// =============================================================================
// Shared Value Lists
// =============================================================================

/** License identifiers — single source of truth for Image attrs and YAML metadata. */
export const licenseValues = [
  'CC0', 'CC BY', 'CC BY-SA', 'CC BY-NC', 'CC BY-NC-SA', 'CC BY-ND', 'CC BY-NC-ND',
  'Public domain', 'Fair use', 'AGPL', 'GPL',
] as const;

export type License = typeof licenseValues[number];

/**
 * Normalize a string-or-list to a list. Idempotent.
 * Useful when an attribute may be a single value or an array (e.g. YAML list vs XML string).
 */
export const z_stringOrList = z.union([z.string(), z.array(z.string())])
  .transform(v => Array.isArray(v) ? v : [v]);

/** URL-validated variant of z_stringOrList. */
export const z_urlOrList = z.union([z.string().url(), z.array(z.string().url())])
  .transform(v => Array.isArray(v) ? v : [v]);

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

/**
 * Licensed content attribution — author(s), hyperlink(s), and license.
 * Usage: baseAttributes.extend({ ...licensed, myAttr: z.string() })
 */
export const licensed = {
  authors: z_stringOrList.optional().describe('Creator name(s)'),
  hyperlink: z_urlOrList.optional().describe('URL(s) to the original work (per CC/GPL license terms)'),
  license: z.enum(licenseValues).optional().describe('License identifier'),
};

/** Parsed output type of the `licensed` fields. */
export type LicensedAttrs = z.output<z.ZodObject<typeof licensed>>;

/**
 * Cast attribute - for blocks that support cast-of-characters.
 * At parse time, withCastSupport() loads the file and replaces the
 * string with a parsed Cast object; hence the union type.
 * Usage: baseAttributes.extend({ ...cast, myAttr: z.string() })
 */
export const cast = {
  cast: z.union([z.string(), CastSchema]).optional()
    .describe('Path to .cast YAML file, or inline cast object'),
};

/**
 * Character attribute - for blocks that refer to a single character from the cast.
 * Provides per-instance overrides for avatar rendering.
 * Usage: baseAttributes.extend({ ...cast, ...character, position: ... })
 */
export const character = {
  who: z.string().optional().describe('Character ID (looked up in cast)'),
  face: Face.optional().describe('DiceBear face/expression override (e.g. smile, serious)'),
  seed: z.string().optional().describe('Override seed for avatar generation'),
  avatar: z.string().optional().describe('Image URL (overrides cast)'),
  avatarStyle: AvatarStyle.optional()
    .describe('Avatar style override'),
};

// =============================================================================
// Legacy Exports (deprecated - use baseAttributes + mixins)
// =============================================================================

// Legacy pre-composed schemas — still widely used; migrate incrementally.
// srcAttributes: ~20 block files import this

/**
 * Convenience: a strict ZodObject with only the `src` attribute.
 * The factory implicitly merges baseAttributes, so this no longer
 * needs to wrap baseAttributes itself.
 *
 * @deprecated Prefer inlining `z.object({...src}).strict()` directly.
 */
export const srcAttributes = z.object({ ...src }).strict();

/** Inferred type for grader attributes */
export type GraderAttributes = z.infer<typeof graderAttributes>;
