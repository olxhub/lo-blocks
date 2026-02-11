// src/components/blocks/display/OlxSlot/_OlxSlot.tsx
//
// Renders OLX from its value field (written by LLMAction) or from a
// target component's value field (reactive student authoring).
//
// Uses RenderOLX internally for full OLX parsing and rendering.
//
'use client';

import React, { useState, useEffect } from 'react';
import { useFieldSelector, componentFieldByName } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function _OlxSlot(props) {
  const { id, fields, target, debounce: debounceMs = 500 } = props;

  // Mode 1: Read from own value field (LLMAction writes here)
  const ownValue = useFieldSelector(props, fields.value, { fallback: '', id });
  const status = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  // Mode 2: Read from target component's value field
  let targetValue = '';
  if (target) {
    try {
      const targetValueField = componentFieldByName(props, target, 'value');
      // eslint-disable-next-line react-hooks/rules-of-hooks
      targetValue = useFieldSelector(props, targetValueField, { fallback: '', id: target });
    } catch {
      // Target not found yet (e.g., loading) - fall back to empty
    }
  }

  // Use target value if target is set, otherwise own value
  const rawOlx = target ? targetValue : ownValue;

  // Debounce for reactive target mode; skip debounce for LLMAction mode
  // (LLM writes once, no need to debounce)
  const olxString = useDebounce(rawOlx, target ? debounceMs : 0);

  // Loading state (from LLMAction)
  if (!target && status === LLM_STATUS.RUNNING) {
    return (
      <div className="olx-slot olx-slot--loading">
        <Spinner>Generating content...</Spinner>
      </div>
    );
  }

  // Error state (from LLMAction)
  if (!target && status === LLM_STATUS.ERROR) {
    return (
      <div className="olx-slot olx-slot--error">
        <DisplayError name="OlxSlot" message={ownValue || 'Content generation failed'} />
      </div>
    );
  }

  // Empty state
  if (!olxString || !olxString.trim()) {
    return null;
  }

  // Render OLX
  return (
    <div className="olx-slot olx-slot--rendered">
      <RenderOLX
        id={id}
        inline={olxString}
        source={`olxslot:${id}`}
        eventContext={`olxslot:${id}`}
        provenance={`olxslot://${id}`}
      />
    </div>
  );
}

export default _OlxSlot;
