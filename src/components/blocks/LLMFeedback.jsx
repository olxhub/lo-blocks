// This component renders output from an LLM call (typically triggered by a <LLMButton>).
// It displays a 🤖 icon, shows a spinner while waiting, and then renders the feedback.

import * as parsers from '@/lib/olx/parsers';
import { dev } from '@/lib/blocks';
import _LLMFeedback from './_LLMFeedback';

const LLMFeedback = dev({
  name: 'LLMFeedback',
  component: _LLMFeedback,
  parser: parsers.ignore // no kids expected yet... later
});

export default LLMFeedback;
