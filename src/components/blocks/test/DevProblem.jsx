import * as parsers from '@/lib/olx/parsers';
import { test } from '@/lib/blocks';
import { _DevProblem } from './_DevProblem';

const DevProblem = test({
  ...parsers.blocks,
  name: 'DevProblem',
  component: _DevProblem,
});

export default DevProblem;
