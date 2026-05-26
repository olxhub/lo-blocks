// src/components/blocks/authoring/OlxSlot/_OlxSlot.tsx
//
// EXPERIMENTAL / PROTOTYPE
//
// Renders an OLX string as live content. Exploring patterns for dynamic
// OLX authoring; API will likely change.
//
// Current UX in target mode:
// - Valid OLX renders quickly (150ms debounce)
// - Errors show after a longer delay (600ms) so mid-typing doesn't flash errors
// - Last successful render stays visible while typing, with "Editing..." indicator
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef } from 'react';
import { useFieldSelector, useFieldState, useValue } from '@/lib/state';
import { LLM_STATUS } from '@/lib/llm/reduxClient';
import { parseOLX } from '@/lib/content/parseOLX';
import { toLofsRef } from '@/lib/types/address';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useKids } from '@/lib/render';

// HACK HACK HACK
// We want debounce at the field level.
// But this works for now.
const ERROR_DEBOUNCE_MS = 600;

const CHROME_STYLE: React.CSSProperties = {
  border: '1px dashed #ccc',
  borderRadius: '4px',
  padding: '8px',
  minHeight: '2em',
  position: 'relative',
};

const CHROME_LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6em',
  left: '8px',
  background: 'white',
  padding: '0 4px',
  fontSize: '0.75em',
  color: '#999',
};

function ChromeLabel({ title }: { title?: string }) {
  if (!title) return null;
  return <span style={CHROME_LABEL_STYLE}>{title}</span>;
}

function _OlxSlot(props: RuntimeProps) {
  const { id, fields, target, title, debounce: debounceMs = 150, chrome = false } = props;
  const stateKey = scopedStateKeyForBlock(props);

  // Mode 1: Read from own value field (LLMAction writes here)
  const ownValue = useFieldSelector(props, fields.value, { fallback: '' });
  const status = useFieldSelector(props, fields.state, { fallback: LLM_STATUS.INIT });

  // Mode 2: Read from target component's selectValue (respects initial content, etc.)
  const { value: targetValue } = useValue(props, { target, fallback: '' });

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
    // Nothing to validate: editor empty or cleared. Reset to clean state
    // so we show the placeholder (children) instead of a stale render.
    if (!candidate || !candidate.trim()) {
      setValidOlx('');
      setStale(false);
      return;
    }

    let cancelled = false;

    async function validate() {
      try {
        const result = await parseOLX(candidate, [toLofsRef('validate://')]);
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
    return () => {
      cancelled = true;
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [candidate, setValidOlx, setStale, setParseError]);

  const olxString = target ? validOlx : debouncedOlx;

  // Children are placeholder content (text or blocks) shown when empty
  const { kids } = useKids(props);

  const chromeStyle = chrome ? CHROME_STYLE : undefined;
  const label = chrome ? <ChromeLabel title={title} /> : null;

  // Loading state (from LLMAction)
  if (!target && status === LLM_STATUS.RUNNING) {
    return (
      <div className="olx-slot olx-slot--loading" style={chromeStyle}>
        {label}
        <Spinner>Generating content...</Spinner>
      </div>
    );
  }

  // Error state (from LLMAction)
  if (!target && status === LLM_STATUS.ERROR) {
    return (
      <div className="olx-slot olx-slot--error" style={chromeStyle}>
        {label}
        <DisplayError title="OlxSlot" message={ownValue || 'Content generation failed'} />
      </div>
    );
  }

  // Show parse error after delay (target mode only)
  // parseError holds the bad OLX string; RenderOLX will show its nice error display
  if (target && parseError && !olxString) {
    return (
      <div className="olx-slot olx-slot--error" style={chromeStyle}>
        {label}
        <RenderOLX
          id={stateKey}
          inline={parseError}
          source={`olxslot:${id}`}
          eventContext={`olxslot:${id}`}
          provenance={`olxslot://${id}`}
        />
      </div>
    );
  }

  // Empty state — show placeholder children if provided, or chrome container
  if (!olxString || !olxString.trim()) {
    if (kids.length > 0) {
      return <div className="olx-slot olx-slot--placeholder" style={chromeStyle}>{label}{kids}</div>;
    }
    return chrome ? <div className="olx-slot olx-slot--empty" style={chromeStyle}>{label}</div> : null;
  }

  // Render OLX (last valid version), with stale indicator or error
  return (
    <div className={`olx-slot olx-slot--rendered${stale ? ' olx-slot--stale' : ''}`} style={chromeStyle}>
      {label}
      {stale && !parseError && (
        <div className="olx-slot-stale-indicator">
          Editing...
        </div>
      )}
      {stale && parseError && (
        <RenderOLX
          id={stateKey}
          inline={parseError}
          source={`olxslot:${id}:error`}
          eventContext={`olxslot:${id}`}
          provenance={`olxslot://${id}`}
        />
      )}
      <RenderOLX
        id={stateKey}
        inline={olxString}
        source={`olxslot:${id}`}
        eventContext={`olxslot:${id}`}
        provenance={`olxslot://${id}`}
      />
    </div>
  );
}

export default _OlxSlot;
