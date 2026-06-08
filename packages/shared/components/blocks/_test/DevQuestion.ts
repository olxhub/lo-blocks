// packages/shared/components/blocks/_test/DevQuestion.ts
import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _DevQuestion } from './_DevQuestion';

export const fields = state.fields(
  ['activeIndex']
);

const DevQuestion = test({
  ...parsers.ignore(),
  name: 'DevQuestion',
  component: _DevQuestion,
  fields: fields,
  internal: true,
});

export default DevQuestion;
