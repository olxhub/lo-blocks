// src/components/blocks/CapaProblem/CapaFooter.ts
import { z } from 'zod';
import * as blocks from '@/lib/blocks';
import { ignore } from '@/lib/content/parsers';
import { baseAttributes, problemMixin } from '@/lib/blocks/attributeSchemas';
import _CapaFooter from './_CapaFooter';

const CapaFooter = blocks.dev({
  ...ignore(),
  name: 'CapaFooter',
  description: 'Problem footer with action buttons (Check, Show Answer) and status display',
  component: _CapaFooter,
  internal: true,
  // Note: Receives runtime attributes from _CapaProblem
  attributes: baseAttributes.extend(problemMixin.shape).extend({
    target: z.string().optional().describe('Comma-separated grader IDs to trigger'),
    hintsTarget: z.string().nullish().describe('DemandHints ID for hint button'),
    label: z.string().optional().describe('Override check button label'),
    // Runtime state (passed from CapaProblem)
    submitCount: z.number().optional().describe('Current submission count'),
    correct: z.string().optional().describe('Current correctness state'),
  }),
});

export default CapaFooter;

