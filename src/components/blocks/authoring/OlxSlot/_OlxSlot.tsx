// src/components/blocks/authoring/OlxSlot/_OlxSlot.tsx
//
// Renders OLX from its value field (written by LLMAction) or from a
// target component's value field (reactive student authoring).
//
// Uses RenderOLX internally for full OLX parsing and rendering.
//
// Key UX in target mode:
// - Valid OLX renders quickly (150ms debounce)
// - Errors show after a longer delay (600ms) so mid-typing doesn't flash errors
// - Last successful render stays visible while typing, with "Editing..." indicator
//
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFieldSelector, componentFieldByName } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { parseOLX } from '@/lib/content/parseOLX';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';

// HACK HACK HACK
// We want debounce at the field level.
// But this works for now.
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const ERROR_DEBOUNCE_MS = 600;

/**
 * Parses candidate OLX and returns what to render.
 * - Valid OLX: updates immediately
 * - Invalid OLX: keeps last valid render, shows error after ERROR_DEBOUNCE_MS
 */
function useValidatedOlx(candidate: string) {
  const [validOlx, setValidOlx] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear previous error and timer on every new candidate (keystroke fix)
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(null);

    if (!candidate || !candidate.trim()) {
      setValidOlx('');
      setStale(false);
      return;
    }

    let cancelled = false;

    async function validate() {
      try {
        const result = await parseOLX(candidate, ['validate://']);
        if (cancelled) return;

        if (result.root && result.errors.length === 0) {
          // Valid -- render immediately
          setValidOlx(candidate);
          setStale(false);
        } else {
          // Invalid -- keep last valid render, schedule error display
          setStale(true);
          errorTimer.current = setTimeout(() => {
            if (!cancelled) setError(candidate);  // Store the bad OLX itself
          }, ERROR_DEBOUNCE_MS);
        }
      } catch {
        if (!cancelled) {
          setStale(true);
          errorTimer.current = setTimeout(() => {
            if (!cancelled) setError(candidate);
          }, ERROR_DEBOUNCE_MS);
        }
      }
    }

    validate();
    return () => { cancelled = true; };
  }, [candidate]);

  return { validOlx, error, stale };
}

function _OlxSlot(props) {
  const { id, fields, target, debounce: debounceMs = 150 } = props;

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
  const debouncedOlx = useDebounce(rawOlx, target ? debounceMs : 0);

  // In target mode, validate before rendering (fast valid, slow errors).
  // In own-value mode (LLMAction), render directly (let RenderOLX show errors).
  const { validOlx, error: parseError, stale } = useValidatedOlx(target ? debouncedOlx : '');
  const olxString = target ? validOlx : debouncedOlx;

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

  // Show parse error after delay (target mode only)
  // parseError holds the bad OLX string; RenderOLX will show its nice error display
  if (target && parseError && !olxString) {
    return (
      <div className="olx-slot olx-slot--error">
        <RenderOLX
          id={id}
          inline={parseError}
          source={`olxslot:${id}`}
          eventContext={`olxslot:${id}`}
          provenance={`olxslot://${id}`}
        />
      </div>
    );
  }

  // Empty state
  if (!olxString || !olxString.trim()) {
    return null;
  }

  // Render OLX (last valid version), with error below if stale
  return (
    <div className={`olx-slot olx-slot--rendered${stale ? ' olx-slot--stale' : ''}`}>
      {stale && (
        <div className="olx-slot-stale-indicator">
          Editing...
        </div>
      )}
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
