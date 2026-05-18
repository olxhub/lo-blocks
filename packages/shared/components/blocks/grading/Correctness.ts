// src/components/blocks/Correctness.jsx
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { ignore } from '@/lib/content/parsers';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import _Correctness from './_Correctness';

const fields = state.fields(['correct', 'submitCount']);

const Correctness = dev({
  ...ignore(),
  name: 'Correctness',
  description: 'Visual indicator showing grading status (correct/incorrect/unsubmitted)',
  component: _Correctness,
  fields,
  requiresGrader: true,
  internal: true,
  // Note: May receive target attribute in certain contexts
  attributes: z.object({
    target: z_stateRef.optional().describe('Target grader ID'),
  }).strict(),
});

export default Correctness;
