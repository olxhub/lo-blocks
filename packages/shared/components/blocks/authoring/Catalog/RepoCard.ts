// RepoCard block — repository card for the catalog system.
//
// Used in two contexts:
//   1. As a child of <Catalog> — rendered with scoped props per repo,
//      receives `repo` as a direct React prop from CatalogView.
//   2. Standalone at /repo/:origin — rendered via RenderOLX with idPrefix
//      set by repoIdPrefix(origin) and `origin` passed as an OLX attribute.
//
// Fields (component-scoped, per-instance via scoped idPrefix):
//   expanded   — whether the compact card's activity list is expanded
//   showBlocks — whether the building-blocks section is visible
//
// Attributes:
//   compact — true (default) for catalog listing, false for full view

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import { repoCardFields } from './locals';

const RepoCard = dev({
  ...parsers.ignore(),
  name: 'RepoCard',
  description: 'Repository card — compact or full view of a repo.',
  // Non-conventional: component lives in repoCard.tsx (lowercase), not the
  // conventional _RepoCard.tsx the generator would wire.
  componentLoader: () => import('./repoCard').then(m => m.default),
  fields: repoCardFields,
  attributes: z.object({
    origin: z.string().optional().describe('Repo origin (e.g. git+https://…@branch or file:…). Required when not passed as a direct React prop.'),
    compact: z_olx_boolean.default(true).describe('true (default) for compact, false for full view'),
  }).strict(),
});

export default RepoCard;
