// src/components/blocks/layout/IntakeGate/IntakeGate.js
//
// IntakeGate block - gates content behind an intake process.
//
// Shows first child (intake form) until LLMActions populate PersonalizedText targets,
// then reveals second child (generated content). Used for personalized content generation flows.
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _IntakeGate from './_IntakeGate';

const IntakeGate = test({
  ...parsers.blocks(),
  name: 'IntakeGate',
  description: 'Gates content behind an intake process - collects input, shows loading while LLM generates, then reveals content',
  component: _IntakeGate,
  attributes: baseAttributes.extend({
    targets: z.string({ required_error: 'targets is required' }).describe('Comma-separated TextSlot IDs to watch for completion'),
  }),
});

export default IntakeGate;
