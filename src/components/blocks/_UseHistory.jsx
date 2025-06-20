// src/components/blocks/_UseHistory.jsx
'use client';

import React, { useEffect } from 'react';
import { render } from '@/lib/render';
import { useReduxInput, useReduxState } from '@/lib/state';
import HistoryBar from '@/components/common/HistoryBar';

export function _UseHistory(props) {
  const { target, fields } = props;

  const [value] = useReduxInput(props, fields.value, target);
  const [history, setHistory] = useReduxState(props, fields.history, []);
  const [index, setIndex] = useReduxState(props, fields.index, 0);
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
        {render({ ...props, node: current })}
      </div>
    </div>
  );
}
