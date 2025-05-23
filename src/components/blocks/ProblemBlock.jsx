import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { renderCompiledChildren } from '@/lib/render';
import { test } from '@/lib/blocks';

function _ProblemBlock({ kids, idMap }) {
  return (
    <div className="border p-4 space-y-2">
      {renderCompiledChildren({ children: kids, idMap })}
    </div>
  );
}

const ProblemBlock = test({
  name: 'ProblemBlock',
  component: _ProblemBlock,
  parser: parsers.xblocks,
});

export default ProblemBlock;
