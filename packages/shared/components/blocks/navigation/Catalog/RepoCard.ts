// RepoCard block — repository card for the catalog system.
//
// Used in two contexts:
//   1. As a child of <Catalog> — rendered with scoped props per repo,
//      receives `repo` as a direct React prop from CatalogView.
//   2. Standalone at /repo/:origin — rendered via RenderOLX with idPrefix
//      set by repoIdPrefix(origin). Decodes origin from its scope.
//
// Fields (component-scoped, per-instance via scoped idPrefix):
//   expanded   — whether the compact card's activity list is expanded
//   showBlocks — whether the building-blocks section is visible
//
// Attributes:
//   compact — 'true' (default) for catalog listing, 'false' for full view

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _RepoCard from './repoCard';
import { repoCardFields } from './locals';

const RepoCard = dev({
  ...parsers.ignore(),
  name: 'RepoCard',
  description: 'Repository card — compact or full view of a repo.',
  component: _RepoCard,
  fields: repoCardFields,
  attributes: z.object({
    compact: z.string().optional().describe('"true" (default) for compact, "false" for full view'),
  }).strict(),
});

export default RepoCard;
