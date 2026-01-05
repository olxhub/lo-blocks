// src/components/blocks/_UseHistory.tsx
'use client';

import React, { useEffect } from 'react';
import { useBlock } from '@/lib/render';
import { useReduxInput, useReduxState, useValue } from '@/lib/state';
import HistoryBar from '@/components/common/HistoryBar';

function HistoryContent({ props, current }) {
  const { block } = useBlock(props, current);
  return <>{block}</>;
}

export function _UseHistory(props) {
  const { target, targetRef, fields, initial } = props;

  // If targetRef is provided, get the target from another component's value
  // Fall back to target if refValue is null/undefined (e.g., before selection)
  const refValue = useValue(props, targetRef, { fallback: null });
  const effectiveTarget = refValue ?? target;

  const defaultHistory = initial ? [initial] : (effectiveTarget ? [effectiveTarget] : []);
  const defaultIndex = defaultHistory.length > 0 ? defaultHistory.length - 1 : 0;

  const [value] = useReduxInput(props, fields.value, effectiveTarget);
  const [history, setHistory] = useReduxState(props, fields.history, defaultHistory);
  const [index, setIndex] = useReduxState(props, fields.index, defaultIndex);
  const [showHistory] = useReduxState(props, fields.showHistory, true);
  const [follow] = useReduxState(props, fields.follow, true);

  useEffect(() => {
    if (!value) return;
    let updated = history;
    if (history.length === 0 || history[history.length - 1] !== value) {
      updated = [...history, value];
      setHistory(updated);
    }
    if (follow) {
      if (index !== updated.length - 1) setIndex(updated.length - 1);
    } else if (index >= updated.length) {
      setIndex(updated.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (follow) setIndex(history.length - 1);
    // setIndex intentionally omitted: it's a stable setState function, so we need
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, history.length]);

  const current = history[index];

  const handlePrev = () => setIndex(Math.max(0, index - 1));
  const handleNext = () => setIndex(Math.min(history.length - 1, index + 1));
  const handleSelect = (i) => setIndex(i);

  if (!current) {
    return <pre className="text-red-500">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return (
    <div>
      <HistoryBar
        history={history}
        index={index}
        showDots={showHistory}
        onPrev={handlePrev}
        onNext={handleNext}
        onSelect={handleSelect}
      />
      <div className="mt-2">
        <HistoryContent props={props} current={current} />
      </div>
    </div>
  );
}
