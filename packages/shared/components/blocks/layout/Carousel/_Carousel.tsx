// _Carousel.tsx - Browse and select from a list of referenced items.
'use client';

import React from 'react';
import { useFieldState, useFieldSelector } from '@/lib/state';
import { useBlock } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import NavArrow from '@/components/common/NavArrow';
import { fisherYatesShuffleInPlace } from '@/lib/utils/shuffle';

function shuffledIds(ids: string[]): string[] {
  const order = [...ids];
  fisherYatesShuffleInPlace(order);
  return order;
}

/** Check that stored order matches the current item list (same IDs, same length). */
function isOrderValid(order: string[] | null, itemIds: string[]): boolean {
  if (!order || order.length !== itemIds.length) return false;
  const expected = new Set(itemIds);
  return order.every(id => expected.has(id));
}

export default function _Carousel(props) {
  const { id, fields, kids, wrap = false, randomize = false } = props;
  const itemIds = kids.itemIds;

  // 1. Hooks (called unconditionally per React rules)
  // value stores the current item ID; title stores the display name; order stores the display sequence
  const [currentId, setCurrentId] = useFieldState(props, fields.value, null);
  const [order, setOrder] = useFieldState(props, fields.order, null);
  const [title, setTitle] = useFieldState(props, fields.title, '');
  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });

  // Keep order in sync: shuffled when randomize is active, authored order otherwise
  if (randomize && !isOrderValid(order, itemIds)) {
    setOrder(shuffledIds(itemIds));
  } else if (!randomize && (!order || !itemIds.every((id, i) => order[i] === id))) {
    setOrder([...itemIds]);
  }

  const displayOrder = isOrderValid(order, itemIds) ? order : itemIds;
  let position = currentId ? displayOrder.indexOf(currentId) : 0;
  if (position < 0) position = 0;

  // Sync value field if unset or stale
  if (displayOrder[position] !== currentId) {
    setCurrentId(displayOrder[position]);
  }

  const { block: renderedItem, olxJson } = useBlock(props, displayOrder[position]);

  // 2. No items — early exit
  if (itemIds.length === 0) {
    return (
      <DisplayError props={props} name="Carousel"
        message="No items found in Carousel"
        technical={{ hint: 'Add item IDs as content, e.g., <Carousel>item_1, item_2</Carousel>', blockId: id }}
        id={`${id}_no_items`}
      />
    );
  }

  // 3. Navigation
  const numItems = displayOrder.length;
  const handlePrev = () => {
    const prev = position > 0 ? position - 1 : (wrap ? numItems - 1 : position);
    setCurrentId(displayOrder[prev]);
  };
  const handleNext = () => {
    const next = position < numItems - 1 ? position + 1 : (wrap ? 0 : position);
    setCurrentId(displayOrder[next]);
  };

  // 4. Title — sync to Redux for Ref/expression access
  const displayTitle = olxJson?.attributes?.title || displayOrder[position];
  if (displayTitle !== title) setTitle(displayTitle);

  // 5. Render
  return (
    <div className="lo-carousel">
      <div className="lo-carousel__header">
        {!isReadonly && (
          <button onClick={handlePrev} disabled={!wrap && position === 0}
            className="lo-carousel__nav lo-carousel__nav--prev" aria-label="Previous">
            <NavArrow direction="back" />
          </button>
        )}
        <div className="lo-carousel__indicator">
          <span className="lo-carousel__title">{displayTitle}</span>
          <span className="lo-carousel__count">{position + 1} of {numItems}</span>
        </div>
        {!isReadonly && (
          <button onClick={handleNext} disabled={!wrap && position === numItems - 1}
            className="lo-carousel__nav lo-carousel__nav--next" aria-label="Next">
            <NavArrow direction="forward" />
          </button>
        )}
      </div>
      <div className="lo-carousel__content">
        {renderedItem}
      </div>
    </div>
  );
}
