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
  ),
  title: z.string().optional(),
  class: z.string().optional(),
  url_name: z.string().optional().refine(
    (id) => !id || VALID_ID_PATTERN.test(id),
    (id) => ({ message: validateOlxId(id) })
  ),  // legacy edX attribute
  launchable: z.string().optional(), // "true" marks block as standalone-launchable
  // TODO: Rename 'label' to 'title' for consistency (label is used by Tabs for tab titles)
  label: z.string().optional().describe('Tab label when used as child of Tabs'),
}).strict();

/**
 * Attributes for blocks that support external source loading via src attribute.
 * Used by blocks with text() or peggyParser() parsers.
 * Inherits strictness from baseAttributes.
 */
export const srcAttributes = baseAttributes.extend({
  src: z.string().optional().describe('Path to external file containing content'),
});
