// src/components/blocks/_UseHistory.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect } from 'react';
import { useBlock } from '@/lib/render';
import { useFieldState, useValue } from '@/lib/state';
import type { StateRef } from '@/lib/types';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import HistoryBar from '@/components/common/HistoryBar';

function HistoryContent({ props, current }: { props: RuntimeProps; current: StateRef }) {
  const stateKey = stateKeyForGlobalRef(current, props.runtime.ns);
  const { block } = useBlock(props, stateKey);
  return <>{block}</>;
}

export function _UseHistory(props: RuntimeProps) {
  const { target, targetRef, fields, initial } = props;

  // If targetRef is provided, get the target from another component's value
  // Fall back to target if refValue is null/undefined (e.g., before selection)
  const { value: refValue } = useValue(props, { target: targetRef, fallback: null });
  const effectiveTarget = refValue ?? target;

  const defaultHistory = initial ? [initial] : (effectiveTarget ? [effectiveTarget] : []);

  // `value` is the single source of truth for what we show. It's written by
  // whoever drives us (a <Chat> repointing) AND by our own navigation buttons.
  // We always display `value`; the cursor is derived (history.indexOf(value)),
  // never stored — so it can't drift out of sync with what's shown.
  const [value, setValue] = useFieldState(props, fields.value, effectiveTarget);
  const [history, setHistory] = useFieldState(props, fields.history, defaultHistory);

  // The only state we accumulate is the list of distinct values seen, for the
  // navigation dots: if `value` is new, record it. That's the whole machine.
  //
  // Because the cursor is derived from `value` rather than stored separately,
  // reload needs no special handling: the event log replays every value-write
  // in order, the last one (your last action — a chat advance or a manual
  // click) is what we land on, and since every replayed value is already in
  // `history` we append nothing and emit no events.
  useEffect(() => {
    if (!value || history.includes(value)) return;
    setHistory([...history, value]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Navigation moves `value` itself (to an entry already in history), so it
  // flows through the exact same display path as a chat-driven repoint.
  const index = history.indexOf(value);
  const current = value;

  const handlePrev = () => { if (index > 0) setValue(history[index - 1]); };
  const handleNext = () => { if (index < history.length - 1) setValue(history[index + 1]); };
  const handleSelect = (i: number) => setValue(history[i]);

  if (!current) {
    return <pre className="text-error">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return (
    <div>
      <HistoryBar
        history={history}
        index={index}
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
