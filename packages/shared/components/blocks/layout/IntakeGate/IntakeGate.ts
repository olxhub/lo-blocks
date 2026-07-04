// packages/shared/components/blocks/layout/IntakeGate/IntakeGate.ts
//
// IntakeGate block - gates content behind a readiness condition.
//
// Shows first child (gate phase) until a `ready` expression is satisfied,
// then reveals second child (content phase). Optionally shows a loading
// spinner when a `loading` expression is satisfied.
//
// The `targets` attribute is shorthand for the common LLM pattern:
// it auto-generates ready/loading expressions that watch TextSlot fields.
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_stateRefList } from '@/lib/blocks/attributeSchemas';

const IntakeGate = test({
  ...parsers.blocks({ requiredChildren: 2 }),
  name: 'IntakeGate',
  description: 'Gates content behind a readiness condition - shows first child until ready, then reveals second child',
  attributes: z.object({
    targets: z_stateRefList.optional().describe('Comma-separated TextSlot IDs to watch (shorthand for LLM flows)'),
    ready: z.string().optional().describe('DSL expression — when truthy, show content (second child)'),
    loading: z.string().optional().describe('DSL expression — when truthy and not ready, show loading spinner'),
  }).strict(),
  // Cross-field check: needs at least one of targets/ready. Lives in
  // validateAttributes (not .refine()) so the schema stays a plain
  // ZodObject and survives the factory's mixin composition merge.
  validateAttributes: (attrs) =>
    attrs.targets || attrs.ready
      ? undefined
      : ['IntakeGate requires either a "targets" or "ready" attribute'],
});

export default IntakeGate;
