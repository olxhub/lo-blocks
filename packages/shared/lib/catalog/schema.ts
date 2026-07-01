// packages/shared/lib/catalog/schema.ts
//
// Wire schemas for the get_repositories tool — the SHARED contract. Pure zod,
// no node imports, so BOTH ends import it: tool.ts (the advertise/handler
// side, server) and useCatalog.ts (the consume/hook side, client). Pairing the
// two ends on one schema is the point. See docs/mcp-authoring.md.
//
// ForgeLink is defined once in address.ts (the domain type) and re-exported
// here; the Zod schema mirrors it for wire validation. One source of truth.

import { z } from 'zod';
import type { ForgeLink, Forge } from '@/lib/types/address';
import { z_appError } from '@/lib/types/errors';

// Re-export so consumers that only need the type can import from schema.ts
// (the catalog's public surface) without reaching into address.ts.
export type { ForgeLink, Forge };

/** Fields beyond the default set. Heavy per-repo fields are opt-in so the
 *  default response stays small (the get_blocks anti-spam discipline). */
export const IncludeField = z.enum([
  // Heavy, per-repo — wired but not yet populated.
  // TODO: read via the source provider (LOFS read path) / git log / forge API.
  'readme',
  'license',
  'contributors',
  'commits',
  'forge',
  // Sub-field of launchables (kept out of the default to stay lean).
  'launchables.description',
]);

export const GetRepositoriesInput = z.object({
  // filter?: string[]   // TODO(2.0): narrow by origin / label / role — pairs with search
  include: z.array(IncludeField).optional().describe(
    'Fields to add beyond the default (repo card + launchables). Heavy per-repo ' +
    'fields are opt-in; request them for repos you care about, not across everything.',
  ),
  drafts: z.enum(['exclude', 'include']).optional().describe(
    'Drafts are excluded by default (authors make many). Pass "include" to get ' +
    'them too; each launchable carries its status either way. draftCount always ' +
    'reports how many were hidden.',
  ),
  // limit?: number       // TODO(2.0): pagination
  // TODO(2.0): offset vs a pagination cursor/key?
});

/** Zod wire schema for ForgeLink (the domain type lives in address.ts).
 *  `forge` is a serializable identity the UI maps to an icon (a component
 *  can't cross the wire); null upstream means no web view is available.
 *  Derived from the origin by the source provider (StorageProvider.forgeLink). */
export const ForgeLinkSchema: z.ZodType<ForgeLink> = z.object({
  url: z.string(),
  forge: z.enum(['github', 'gitlab']),
  label: z.string().describe('Action label, e.g. "View on GitHub"'),
});

export const LaunchableSchema = z.object({
  id: z.string(),
  role: z.enum(['course', 'activity', 'internal', 'other']).describe(
    'What the block IS (courseware-model). course/activity are public learning ' +
    'objects; internal is a building block composed into others (editable, never ' +
    'launched on its own, kept out of the public lists); other is a launchable ' +
    'that is none of these (reserved for finer kinds).',
  ),
  status: z.enum(['draft', 'usable']).describe('draft (work in progress) vs usable'),
  title: z.string(),
  type: z.string().describe('Block tag'),
  index: z.number().optional().describe('Author-declared ordering hint within its collection; absent when undeclared'),
  path: z.string().describe('Repo-relative path; opens in Studio as ?file='),
  description: z.string().optional().describe('Only when include: launchables.description'),
  forgeLink: ForgeLinkSchema.nullable().describe('Link to this file on its forge, or null'),
});

export const RepositorySchema = z.object({
  origin: z.string().describe('The handle — git+https:…@branch or file:…'),
  label: z.string().describe('manifest title, else the configured source label'),
  writable: z.boolean(),
  // Repo descriptor (from the source-root manifest.yaml — see courseware-model).
  description: z.string().nullable(),
  discipline: z.string().nullable(),
  launchableCount: z.number().describe('usable, public launchables (drafts and internal blocks excluded)'),
  draftCount: z.number().describe('launchables hidden as drafts'),
  internalCount: z.number().describe('internal building blocks (role: internal) — editable, not launched on their own'),
  launchables: z.array(LaunchableSchema),
  internal: z.array(LaunchableSchema).describe(
    'Building blocks (role: internal) — editable, never launched on their own. ' +
    'Listed so authoring surfaces can reach them; kept separate from launchables.',
  ),
  forgeLink: ForgeLinkSchema.nullable().describe('Link to the repo on its forge, or null'),
  error: z_appError.nullable().optional().describe(
    'Non-null when the source could not be loaded (auth failure, network error, etc.). ' +
    'The repo card still appears so the user knows the source is configured — but ' +
    'launchables/counts will be empty. Spread into DisplayError for rendering.',
  ),

  // include-only (null until wired — see TODOs above):
  readme: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  contributors: z.array(z.object({ name: z.string(), commits: z.number() })).nullable().optional(),
  commits: z.array(z.object({ sha: z.string(), message: z.string(), author: z.string(), when: z.string() })).nullable().optional(),
  forge: z.object({ description: z.string(), url: z.string() }).nullable().optional(),
});

export const GetRepositoriesOutput = z.object({
  repositories: z.array(RepositorySchema),
  total: z.number().describe('Total repositories (before pagination, once that exists)'),
});

export type Launchable = z.infer<typeof LaunchableSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type GetRepositoriesResult = z.infer<typeof GetRepositoriesOutput>;
