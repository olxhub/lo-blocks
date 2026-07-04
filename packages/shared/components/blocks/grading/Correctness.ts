// packages/shared/components/blocks/grading/Correctness.ts
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { ignore } from '@/lib/content/parsers';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';

const fields = state.fields(['correct', 'submitCount']);

const Correctness = dev({
  ...ignore(),
  name: 'Correctness',
  description: 'Visual indicator showing grading status (correct/incorrect/unsubmitted)',
  fields,
  requiresGrader: true,
  internal: true,
  // Note: May receive target attribute in certain contexts
  attributes: z.object({
    target: z_stateRef.optional().describe('Target grader ID'),
  }).strict(),
});

export default Correctness;
