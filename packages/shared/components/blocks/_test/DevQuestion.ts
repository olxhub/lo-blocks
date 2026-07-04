// packages/shared/components/blocks/_test/DevQuestion.ts
import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';

export const fields = state.fields(
  ['activeIndex']
);

const DevQuestion = test({
  ...parsers.ignore(),
  name: 'DevQuestion',
  fields: fields,
  internal: true,
});

export default DevQuestion;
