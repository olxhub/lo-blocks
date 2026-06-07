// packages/shared/components/blocks/_test/DevProblem.ts
import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';
import { _DevProblem } from './_DevProblem';

const DevProblem = test({
  ...parsers.blocks(),
  name: 'DevProblem',
  component: _DevProblem,
  internal: true,
});

export default DevProblem;
