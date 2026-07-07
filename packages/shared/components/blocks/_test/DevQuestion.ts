// packages/shared/components/blocks/_test/DevQuestion.ts
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';

export const fields = state.fields(
  ['activeIndex']
);

const attributes = z.object({
  prompt: z.string().optional().describe('Question text shown above the options'),
  options: z.string().optional().describe('Comma-separated option labels'),
});

const DevQuestion = test({
  ...parsers.ignore(),
  name: 'DevQuestion',
  fields: fields,
  attributes,
  internal: true,
});

export default DevQuestion;
