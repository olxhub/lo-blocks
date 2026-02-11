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
import { VALID_ID_SEGMENT } from './idResolver';

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
  target: z.string().optional().describe('ID of input to grade (inferred if omitted)'),
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
