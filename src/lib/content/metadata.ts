// src/lib/content/metadata.ts
//
// OLX Metadata Schema - defines and validates metadata from YAML frontmatter comments
//
// Metadata is specified in the first comment before the root element using YAML frontmatter:
//
// <!--
// ---
// description: A brief description of this activity
// author: Content Creator Name
// tags:
//   - psychology
//   - assessment
// category: psychology
// ---
// -->
// <Vertical id="my_activity">
//   ...
// </Vertical>
//
// The schema uses Zod for validation and provides type-safe access to metadata fields.
//

import { z } from 'zod';

/**
 * Schema for OLX file metadata
 *
 * Currently supports:
 * - description: Brief text description of the activity/content
 */
export const OLXMetadataSchema = z.object({
  description: z.string().optional(),
  category: z.string().optional(),

  // Potential future fields - uncomment and implement as needed:

  // commitAuthor[s]: z.string().optional(),
  // contributors: z.array(z.object({
  //   name: z.string(),
  //   role: z.string().optional()
  // })).optional(),

  // tags: z.array(z.string()).optional(),
  // namespace: z.string().optional(),
  // modified: z.string().datetime().optional(),

  // This might be a link to the parent objects, a git hash, a
  // human-friendly version number, some combination, or something
  // else
  // version: z.string().optional(),
})

export type OLXMetadata = z.infer<typeof OLXMetadataSchema>;
