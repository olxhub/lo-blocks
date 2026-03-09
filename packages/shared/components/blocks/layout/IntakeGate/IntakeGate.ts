// src/components/blocks/layout/IntakeGate/IntakeGate.js
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
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _IntakeGate from './_IntakeGate';

const IntakeGate = test({
  ...parsers.blocks(),
  name: 'IntakeGate',
  description: 'Gates content behind a readiness condition - shows first child until ready, then reveals second child',
  component: _IntakeGate,
  attributes: baseAttributes.extend({
    targets: z.string().optional().describe('Comma-separated TextSlot IDs to watch (shorthand for LLM flows)'),
    ready: z.string().optional().describe('DSL expression — when truthy, show content (second child)'),
    loading: z.string().optional().describe('DSL expression — when truthy and not ready, show loading spinner'),
  }).refine(
    (attrs) => attrs.targets || attrs.ready,
    { message: 'IntakeGate requires either a "targets" or "ready" attribute' }
  ),
});

export default IntakeGate;
