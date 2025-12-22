// src/components/blocks/display/TextSlot/_TextSlot.jsx
//
// A slot that receives text from other blocks (e.g., LLMAction).
// Minimal display - just a span.
//
'use client';

import { useFieldSelector } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient.jsx';

function _TextSlot(props) {
  const { id, fields } = props;

  const text = useFieldSelector(props, fields.value, { fallback: '', id });
  const status = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  // Show nothing while waiting for initial population
  if (status === LLM_STATUS.INIT && !text) {
    return null;
  }

  // Show simple loading indicator while generating
  if (status === LLM_STATUS.RUNNING) {
    return <span className="text-slot text-slot--loading">...</span>;
  }

  // Render the text
  return <span className="text-slot">{text}</span>;
}

export default _TextSlot;
