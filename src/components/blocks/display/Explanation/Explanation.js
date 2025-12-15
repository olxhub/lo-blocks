// src/components/blocks/display/Explanation/Explanation.js
//
// Explanation block - displays content conditionally based on grader state.
//
// Used in CapaProblem to show explanations after correct answer or submission.
// Compatible with Open edX CAPA [explanation] blocks.
//
// Usage:
//   <Explanation>Content shown after correct answer</Explanation>
//   <Explanation showWhen="answered">Content shown after any submission</Explanation>
//   <Explanation showWhen="always">Always visible (debugging)</Explanation>
//
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Explanation from './_Explanation';

const Explanation = dev({
  ...parsers.blocks.allowHTML(),
  name: 'Explanation',
  description: 'Displays explanation content conditionally based on grader state (e.g., after correct answer)',
  component: _Explanation
});

export default Explanation;
