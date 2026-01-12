// src/lib/blocks/attributeSchemas.js
//
// Base attribute schemas for block validation.
//
// Provides common attribute definitions that blocks can extend.
// These are STRICT by default - unknown attributes cause validation errors.
//
// Usage:
//   baseAttributes.extend({ answer: z.string() })           // strict (inherited)
//   baseAttributes.extend({ answer: z.string() }).passthrough()  // allow extras
//
// For blocks without a schema, parseOLX falls back to passthrough mode,
// allowing rapid prototyping without defining every attribute upfront.
//
import { z } from 'zod';

/**
 * Valid OLX ID pattern - must not contain namespace/path delimiters.
 * Reserved characters: . / : and whitespace
 * These are used for runtime namespacing (e.g., "list.0.child") and path syntax.
 */
const VALID_ID_PATTERN = /^[^./:,\s]+$/;

/**
 * Zod refinement for validating OLX IDs.
 * Returns undefined if valid, error message if invalid.
 */
const validateOlxId = (id) => {
  if (!id) return undefined; // Optional IDs are fine
  if (!VALID_ID_PATTERN.test(id)) {
    return `ID "${id}" contains reserved characters. IDs cannot contain: . / : , or whitespace`;
  }
  return undefined;
};

/**
 * Base attributes common to all blocks.
 * Extend this for block-specific attributes.
 * STRICT: unknown attributes will cause validation errors.
 */
export const baseAttributes = z.object({
  id: z.string().optional().refine(
    (id) => !id || VALID_ID_PATTERN.test(id),
    (id) => ({ message: validateOlxId(id) })
  ).describe('Unique identifier (letters, numbers, underscore)'),
  title: z.string().optional().describe('Display title (shown in tabs, course navigation, headers)'),
  class: z.string().optional().describe('Visual styling classes (CSS classes for developers)'),
  launchable: z.string().optional().describe('Set to "true" to show in activity indexes'),
  initialPosition: z.string().optional().describe('Initial position for sortable items'),
}).strict();

/**
 * Names of all base attributes (for documentation filtering).
 */
export const BASE_ATTRIBUTE_NAMES = Object.keys(baseAttributes.shape);

/**
 * Placeholder attribute - mixin for blocks that support placeholder text.
 * Use with baseAttributes.extend(placeholder)
 */
export const placeholder = {
  placeholder: z.string().optional().describe('Placeholder text displayed when empty'),
};

/**
 * Slot attribute - mixin for input blocks used with multi-input graders.
 * Use with baseAttributes.extend(slot) or inputAttributes
 */
export const slot = {
  slot: z.string().optional().describe('Named slot for multi-input graders (e.g., "numerator")'),
};

/**
 * Attributes for blocks that support external source loading via src attribute.
 * Used by blocks with text() or peggyParser() parsers.
 * Inherits strictness from baseAttributes.
 */
export const srcAttributes = baseAttributes.extend({
  src: z.string().optional().describe('Path to external file containing content'),
});

/**
 * Attributes for input blocks.
 * Includes slot for multi-input graders (e.g., RatioGrader).
 */
export const inputAttributes = baseAttributes.extend(slot);

/**
 * Attributes for grader blocks.
 * Includes target for specifying which input(s) to grade.
 */
export const graderAttributes = baseAttributes.extend({
  target: z.string().optional().describe('ID of input to grade (inferred if omitted)'),
});

/** Inferred type for grader attributes */
export type GraderAttributes = z.infer<typeof graderAttributes>;
