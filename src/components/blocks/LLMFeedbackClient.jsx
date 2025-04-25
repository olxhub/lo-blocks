'use client';

import React from 'react';
import { useDispatch } from 'react-redux';

import { useComponentSelector } from 'lo_event/lo_event/lo_assess/selectors.js';
import { LLM_RUNNING, LLM_INIT } from '@/lib/llm/client.jsx';

import Spinner from './Spinner';

function _LLMFeedback({ children, id }) {
  const dispatch = useDispatch();

  const feedback = useComponentSelector(id, s => s?.value ?? '');
  const state = useComponentSelector(id, s => s?.state ?? LLM_INIT);

  return (
    <div className="bg-gray-50 border rounded p-3 text-sm">
      <div className="text-center text-xl">🤖</div>
      {state === LLM_RUNNING ? <Spinner /> : feedback}
    </div>
  );
}


export default _LLMFeedback;
