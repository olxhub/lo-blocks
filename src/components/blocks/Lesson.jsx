import React from 'react';

// DebugWrapper will handle debug info universally
import { renderCompiledChildren } from '@/lib/render';
import * as parsers from '@/lib/olx/parsers';
import { test } from '@/lib/blocks';

function _Lesson( props ) {
  return (
    <div className="p-4 space-y-4 border-l-4 border-blue-300 bg-blue-50">
      {renderCompiledChildren({ ...props, kids: props.kids })}
    </div>
  );
}

const Lesson = test({
  ...parsers.xblocks,
  name: 'Lesson',
  component: _Lesson,
});

export default Lesson;
