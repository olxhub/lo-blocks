import React from 'react';

import * as parsers from '@/lib/olx/parsers';
import { Trace } from '@/lib/debug';
import { test } from '@/lib/blocks';

function _QuestionBlock({ prompt, url_name, id, options = [] }) {
  const optionList = typeof options === 'string' ? options.split(',') : options;

  return (
    <div className="p-4 border rounded">
      <Trace>
        [QuestionBlock / (url_name: {url_name || 'n/a'}) / (id: {id || 'n/a'})]
      </Trace>
      <p className="mb-2">Prompt: {prompt}</p>
      <ul>
        {optionList.map((opt, i) => (
          <li key={i} className="mb-1">
            <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
              {opt.trim()}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const QuestionBlock = test({
  name: 'QuestionBlock',
  component: _QuestionBlock,
  parser: parsers.ignore,
});

export default QuestionBlock;
