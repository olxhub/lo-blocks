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

import React, { useEffect, useRef } from 'react';
import { useFieldSelector, useFieldState, useValue } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { parseOLX } from '@/lib/content/parseOLX';
import type { ProvenanceURI } from '@/lib/types';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useKids } from '@/lib/render';

// HACK HACK HACK
// We want debounce at the field level.
// But this works for now.
const ERROR_DEBOUNCE_MS = 600;

function _OlxSlot(props) {
  const { id, fields, target, debounce: debounceMs = 150 } = props;

  // Mode 1: Read from own value field (LLMAction writes here)
  const ownValue = useFieldSelector(props, fields.value, { fallback: '', id });
  const status = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT, id });

  // Mode 2: Read from target component's getValue (respects initial content, etc.)
  const targetValue = useValue(props, target, { fallback: '' });

  // Use target value if target is set, otherwise own value
  const rawOlx = target ? targetValue : ownValue;

  // --- Debounce (HACK: should be a debounced field) ---
  const [debounced, setDebounced] = useFieldState(props, fields.debounced, '');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(rawOlx), target ? debounceMs : 0);
    return () => clearTimeout(timer);
  }, [rawOlx, target, debounceMs, setDebounced]);

  const debouncedOlx = target ? debounced : rawOlx;

  // --- Validation state (all in Redux for replay) ---
  const [validOlx, setValidOlx] = useFieldState(props, fields.validOlx, '');
  const [parseError, setParseError] = useFieldState(props, fields.error, null);
  const [stale, setStale] = useFieldState(props, fields.stale, false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every keystroke (rawOlx change) clears the error timer.
  // Errors only show after ERROR_DEBOUNCE_MS of inactivity.
  useEffect(() => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setParseError(null);
  }, [rawOlx, setParseError]);

  // Validate debounced OLX (target mode only)
  const candidate = target ? debouncedOlx : '';
  useEffect(() => {
    if (!candidate || !candidate.trim()) {
      setValidOlx('');
      setStale(false);
      return;
    }

    let cancelled = false;

    async function validate() {
      try {
        const result = await parseOLX(candidate, ['validate://' as ProvenanceURI]);
        if (cancelled) return;

        if (result.root && result.errors.length === 0) {
          setValidOlx(candidate);
          setStale(false);
        } else {
          setStale(true);
          errorTimer.current = setTimeout(() => {
            if (!cancelled) setParseError(candidate);
          }, ERROR_DEBOUNCE_MS);
        }
      } catch {
        if (!cancelled) {
          setStale(true);
          errorTimer.current = setTimeout(() => {
            if (!cancelled) setParseError(candidate);
          }, ERROR_DEBOUNCE_MS);
        }
      }
    }

    validate();
    return () => { cancelled = true; };
  }, [candidate, setValidOlx, setStale, setParseError]);

  const olxString = target ? validOlx : debouncedOlx;

  // Children are placeholder content (text or blocks) shown when empty
  const { kids } = useKids(props);

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

  // Empty state — show placeholder children if provided
  if (!olxString || !olxString.trim()) {
    return kids ? <div className="olx-slot olx-slot--placeholder">{kids}</div> : null;
  }

  // Render OLX (last valid version), with stale indicator or error
  return (
    <div className={`olx-slot olx-slot--rendered${stale ? ' olx-slot--stale' : ''}`}>
      {stale && !parseError && (
        <div className="olx-slot-stale-indicator">
          Editing...
        </div>
      )}
      {stale && parseError && (
        <RenderOLX
          id={id}
          inline={parseError}
          source={`olxslot:${id}:error`}
          eventContext={`olxslot:${id}`}
          provenance={`olxslot://${id}`}
        />
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
