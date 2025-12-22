// src/components/blocks/layout/Gated/Gated.js
//
// Gated block - gates content behind prerequisite actions.
//
// Shows first child until LLMActions populate PersonalizedText targets,
// then reveals second child. Used for personalized content generation flows.
//
import { test } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Gated from './_Gated';

const Gated = test({
  ...parsers.blocks(),
  name: 'Gated',
  description: 'Gates content behind prerequisite actions - shows loading while LLM generates, then reveals content',
  component: _Gated,
});

export default Gated;
