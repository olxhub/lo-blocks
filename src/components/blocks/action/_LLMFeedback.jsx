// src/components/blocks/_LLMFeedback.jsx
'use client';

import React from 'react';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient.jsx';

import Spinner from '@/components/blocks/utility/_Spinner';

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
    <div className="llm-feedback-container">
      <div className="llm-feedback-icon">🤖</div>
      <div className="llm-feedback-content">
        {llmState === LLM_STATUS.RUNNING ? <Spinner /> : feedback}
      </div>
    </div>
  );
}


export default _LLMFeedback;
