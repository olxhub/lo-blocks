// packages/shared/components/blocks/authoring/Studio/Studio.ts
//
// Studio — the authoring environment as a block: source selector, file
// tree, code editor with live preview, docs/search/chat side panels,
// save with optimistic concurrency. This is the block behind /studio;
// apps/client's StudioPage renders it directly.
//
// The page-level state (which source, which file, which sidebar tab) is
// URL-synced through system-scoped fields — see locals.ts — preserving
// the legacy ?source=&file=&tab= contract.
//
// Rebuilt from the legacy Next.js studio shell (apps/web/app/studio)
// against a behavior inventory; the editing engine (CodeEditor with OLX
// autocomplete, PreviewPane) was always in components/common and is
// reused unchanged.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { studioFields } from './locals';

const Studio = dev({
  ...parsers.ignore(),
  name: 'Studio',
  description: 'Authoring environment: file tree, OLX editor with live preview, docs and LLM chat',
  requiresUniqueId: false,
  internal: true,
  attributes: z.object({}).strict(),
  fields: studioFields,
});

export default Studio;
