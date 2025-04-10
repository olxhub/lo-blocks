import React from 'react';

import { Trace } from '@/lib/debug';
import { renderCompiledChildren } from '@/lib/render';
import * as parsers from '@/lib/olx/parsers';
import { test } from '../blocks.js';

function _Lesson({ kids, idMap }) {
  return (
    <div className="p-4 space-y-4 border-l-4 border-blue-300 bg-blue-50">
      <h2 className="font-bold text-blue-700">
        [lesson / (url_name: n/a)]
      </h2>
      {renderCompiledChildren({ children: kids, idMap })}
    </div>
  );
}

const Lesson = test({
  name: 'Lesson',
  component: _Lesson,
  parser: parsers.xblocks,
});

export default Lesson;
