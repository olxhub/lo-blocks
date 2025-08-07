// src/components/blocks/LLMFeedback.jsx
// This component renders output from an LLM call (typically triggered by a <LLMButton>).
// It displays a 🤖 icon, shows a spinner while waiting, and then renders the feedback.

import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import _LLMFeedback from './_LLMFeedback';

export const fields = state.fields(['value', 'state']);

const LLMFeedback = dev({
  ...parsers.ignore(), // no kids expected yet... later
  name: 'LLMFeedback',
  description: 'Displays AI-generated feedback responses to student input',
  component: _LLMFeedback,
  fields
});

export default LLMFeedback;
