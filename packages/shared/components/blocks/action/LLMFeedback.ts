// packages/shared/components/blocks/action/LLMFeedback.ts
// This component renders output from an LLM call (typically triggered by a <LLMButton>).
// It displays a 🤖 icon, shows a spinner while waiting, and then renders the feedback.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { placeholder } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields(['value', 'state']);

const LLMFeedback = dev({
  ...parsers.ignore(), // no kids expected yet... later
  name: 'LLMFeedback',
  description: 'Displays AI-generated feedback responses to student input',
  fields,
  attributes: z.object({
    ...placeholder,
    render: z.enum(['markdown', 'text', 'code']).default('markdown')
      .describe('How to render the LLM output: markdown (default), text, or code'),
  }).strict(),
});

export default LLMFeedback;
