// src/components/blocks/_LLMFeedback.jsx
'use client';

import React from 'react';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient.jsx';
import { DisplayError } from '@/lib/util/debug';

import Spinner from '@/components/blocks/utility/_Spinner';

function _LLMFeedback(props) {
  const { id, fields } = props;

  const feedback = useFieldSelector(props, fields.value, { fallback: '', id });
  const llmState = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  const isEmpty = llmState === LLM_STATUS.INIT && !feedback;
  const isError = llmState === LLM_STATUS.ERROR;

  const renderContent = () => {
    if (llmState === LLM_STATUS.RUNNING) {
      return <Spinner />;
    }
    if (isError) {
      return <DisplayError name="LLMFeedback" message={feedback || 'LLM request failed'} />;
    }
    if (isEmpty) {
      return <span className="llm-feedback-placeholder">AI feedback will appear here</span>;
    }
    return feedback;
  };

  return (
    <div className={`llm-feedback-container ${isEmpty ? 'llm-feedback-empty' : ''}`}>
      <div className="llm-feedback-icon">🤖</div>
      <div className="llm-feedback-content">
        {renderContent()}
      </div>
    </div>
  );
}


export default _LLMFeedback;
