// packages/shared/components/blocks/_test/DevProblem.ts
import * as parsers from '@/lib/content/parsers';
import { test } from '@/lib/blocks';

const DevProblem = test({
  ...parsers.blocks(),
  name: 'DevProblem',
  internal: true,
});

export default DevProblem;
