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
import { z } from 'zod';
import { dev, visibilityHandlers } from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import * as parsers from '@/lib/content/parsers';
import _Explanation from './_Explanation';

const validShowWhen = Object.keys(visibilityHandlers) as [string, ...string[]];

const Explanation = dev({
  ...parsers.blocks.allowHTML(),
  name: 'Explanation',
  description: 'Displays explanation content conditionally based on grader state (e.g., after correct answer)',
  component: _Explanation,
  requiresGrader: true,
  attributes: baseAttributes.extend({
    showWhen: z.enum(validShowWhen).default('correct'),
    target: z.string().optional(),
  }),
});

export default Explanation;
