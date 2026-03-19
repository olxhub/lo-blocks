// src/components/blocks/_LLMFeedback.jsx
'use client';

import React from 'react';
import RenderMarkdown from '@/components/common/RenderMarkdown';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { DisplayError } from '@/lib/util/debug';

import Spinner from '@/components/blocks/utility/_Spinner';

function _LLMFeedback(props) {
  const { id, fields, render } = props;

  const feedback = useFieldSelector(props, fields.value, { fallback: '', id });
  const llmState = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  const isEmpty = llmState === LLM_STATUS.INIT && !feedback;
  const isError = llmState === LLM_STATUS.ERROR;

  const renderFeedback = () => {
    switch (render) {
      case 'markdown':
        return (
          <div className="llm-feedback-markdown">
            <RenderMarkdown>{feedback}</RenderMarkdown>
          </div>
        );
      case 'code':
        return <pre className="llm-feedback-code"><code>{feedback}</code></pre>;
      case 'text':
      default:
        return <span className="llm-feedback-text">{feedback}</span>;
    }
  };

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
    return renderFeedback();
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
