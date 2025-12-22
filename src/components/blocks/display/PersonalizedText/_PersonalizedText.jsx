// src/components/blocks/display/PersonalizedText/_PersonalizedText.jsx
//
// Simple text display that gets populated by LLMAction.
// Like LLMFeedback but minimal - just a span, no styling.
//
'use client';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient.jsx';

function _PersonalizedText(props) {
  const { id, fields } = props;

  const text = useFieldSelector(props, fields.value, { fallback: '', id });
  const status = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  // Show nothing while waiting for initial population
  if (status === LLM_STATUS.INIT && !text) {
    return null;
  }

  // Show simple loading indicator while generating
  if (status === LLM_STATUS.RUNNING) {
    return <span className="personalized-text-loading">...</span>;
  }

  // Render the text
  return <span className="personalized-text">{text}</span>;
}

export default _PersonalizedText;
