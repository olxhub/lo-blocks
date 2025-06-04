import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { renderCompiledChildren } from '@/lib/render';
import { test } from '@/lib/blocks';

function _ProblemBlock( params ) {
  return (
    <div className="border p-4 space-y-2">
      {renderCompiledChildren({ ...params, kids: params.kids })}
    </div>
  );
}

const ProblemBlock = test({
  ...parsers.xblocks,
  name: 'ProblemBlock',
  component: _ProblemBlock,
});

export default ProblemBlock;
