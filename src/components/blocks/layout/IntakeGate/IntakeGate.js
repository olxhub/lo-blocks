// src/components/blocks/layout/IntakeGate/IntakeGate.js
//
// IntakeGate block - gates content behind an intake process.
//
// Shows first child (intake form) until LLMActions populate PersonalizedText targets,
// then reveals second child (generated content). Used for personalized content generation flows.
//
import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _IntakeGate from './_IntakeGate';

const IntakeGate = test({
  ...parsers.blocks(),
  name: 'IntakeGate',
  description: 'Gates content behind an intake process - collects input, shows loading while LLM generates, then reveals content',
  component: _IntakeGate,
});

export default IntakeGate;
