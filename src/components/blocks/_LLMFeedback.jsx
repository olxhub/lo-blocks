// src/components/blocks/_LLMFeedback.jsx
'use client';

import React from 'react';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient.jsx';

import Spinner from './Spinner';

function _LLMFeedback(props) {
  const { children, id, fields } = props;

  const feedback = useFieldSelector(
    props,
    fields.value,
    { selector: s => s?.value ?? '', fallback: '', id }
  );
  const llmState = useFieldSelector(
    props,
    fields.state,
    { selector: s => s?.state ?? LLM_STATUS.INIT, fallback: LLM_STATUS.INIT, id }
  );

  return (
    <div className="bg-gray-50 border rounded p-3 text-sm">
      <div className="text-center text-xl">🤖</div>
      {llmState === LLM_STATUS.RUNNING ? <Spinner /> : feedback}
    </div>
  );
}


export default _LLMFeedback;
