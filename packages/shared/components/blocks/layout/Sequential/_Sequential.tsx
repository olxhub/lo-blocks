// packages/shared/components/blocks/layout/Sequential/_Sequential.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useSelector } from 'react-redux';
import { useFieldState } from '@/lib/state';
import { useKids, useKidsJson } from '@/lib/player/client/render';
import { canAdvanceChildren } from '@/lib/player/advance';
import HistoryBar from '@/components/common/HistoryBar';
import NavArrow from '@/components/common/NavArrow';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

// Child component for rendering the current item with use()
// Separated because use() cannot be called conditionally
function SequentialItem({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

export default function Sequential(props: RuntimeProps) {
  const { fields } = props;
  const { t } = useBlockTranslation(props);
  // Get current index from Redux state
  const [index, setIndex] = useFieldState(
    props,
    fields.index,
    0
  );

  // Get kids with when= filtering applied (OlxJson, not rendered).
  // Only the active child is rendered for performance.
  const kidsJson = useKidsJson(props);
  const numItems = kidsJson.length;

  // Basic clamping (done): index clamped below if when= filtering shrinks the list.
  //
  // Known limitation: we track position, not identity. If when= filtering
  // removes an item *before* the current position, the view jumps. E.g.
  // viewing item 3 of [a,b,c,d], b disappears → now at position 3 of
  // [a,c,d] = d, not c.
  //
  // The shared useKidCursor hook now provides identity-based active-child
  // navigation for Tabs. Sequential has not been migrated yet: doing so also
  // requires adapting its advance/canAdvance behavior and legacy `index` state.
  const clampedIndex = Math.min(index, numItems - 1);
  if (clampedIndex !== index && numItems > 0) setIndex(clampedIndex);

  const currentChild = clampedIndex >= 0 && clampedIndex < numItems ? kidsJson[clampedIndex] : null;

  // Check if the current child (or its descendants) can advance.
  // When true, spacebar will advance the child — so dim the Next button
  // to signal that Next isn't the primary action right now.
  const childCanAdvance = useSelector((reduxState: any) =>
    canAdvanceChildren(props.nodeInfo, reduxState)
  );

  // Navigation handlers
  const handlePrev = () => {
    if (index > 0) {
      setIndex(index - 1);
    }
  };

  const handleNext = () => {
    if (index < numItems - 1) {
      setIndex(index + 1);
    }
  };

  const handleSelect = (newIndex) => {
    if (newIndex >= 0 && newIndex < numItems) {
      setIndex(newIndex);
    }
  };

  // Create history array for HistoryBar (just indices)
  const history = Array.from({ length: numItems }, (_, i) => i);

  return (
    <div className="w-full">
      {/* Icon bar at top */}
      <div className="flex justify-center mb-6 p-4 border-b">
        <HistoryBar
          history={history}
          index={clampedIndex}
          showDots={true}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelect={handleSelect}
        />
      </div>

      {/* Current sequence item */}
      <div className="flex-1">
        {currentChild && (
          <div key={`${currentChild.id}.${clampedIndex}`} className="min-h-96">
            <SequentialItem props={props} node={currentChild} />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t">
        {numItems > 1 ? (
          <button
            onClick={handlePrev}
            disabled={index <= 0}
            className="px-4 py-2 bg-muted text-secondary rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted inline-flex items-center gap-1"
          >
            <NavArrow direction="back" /> {t('previous')}
          </button>
        ) : <div />}

        <div className="text-sm text-dimmed">
          {t('progress', { current: clampedIndex + 1, total: numItems })}
        </div>

        {numItems > 1 ? (
          <button
            onClick={handleNext}
            disabled={index >= numItems - 1}
            className={`px-4 py-2 rounded inline-flex items-center gap-1 ${
              index >= numItems - 1
                ? 'bg-accent text-inverse opacity-50 cursor-not-allowed'
                : childCanAdvance
                  ? 'bg-muted text-dimmed hover:bg-accent hover:text-inverse'
                  : 'bg-accent text-inverse hover:bg-accent-hover'
            }`}
          >
            {t('next')} <NavArrow direction="forward" />
          </button>
        ) : <div />}
      </div>
    </div>
  );
}
