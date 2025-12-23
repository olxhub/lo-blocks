// src/components/blocks/LLMFeedback.jsx
// This component renders output from an LLM call (typically triggered by a <LLMButton>).
// It displays a 🤖 icon, shows a spinner while waiting, and then renders the feedback.

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _LLMFeedback from './_LLMFeedback';

export const fields = state.fields(['value', 'state']);

const LLMFeedback = dev({
  ...parsers.ignore(), // no kids expected yet... later
  name: 'LLMFeedback',
  description: 'Displays AI-generated feedback responses to student input',
  component: _LLMFeedback,
  fields,
  attributes: baseAttributes.extend({
    placeholder: z.string().optional().describe('Placeholder text shown before feedback is generated'),
  }),
});

export default LLMFeedback;
