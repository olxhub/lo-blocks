// _Carousel.tsx - Browse and select from a list of referenced items.
'use client';

import React from 'react';
import { useFieldState, useFieldSelector } from '@/lib/state';
import { useBlock } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import NavArrow from '@/components/common/NavArrow';
import { fisherYatesShuffleInPlace } from '@/lib/utils/shuffle';

function shuffledIndices(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  fisherYatesShuffleInPlace(order);
  return order;
}

export default function _Carousel(props) {
  const { id, fields, kids, wrap = false, randomize = false } = props;
  const itemIds = kids.itemIds;

  // 1. Hooks (called unconditionally per React rules)
  let [index, setIndex] = useFieldState(props, fields.index, 0);
  const [order, setOrder] = useFieldState(props, fields.order, null);
  const [value, setValue] = useFieldState(props, fields.value, '');
  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });

  // Initialize or validate shuffled order
  if (randomize && (!order || order.length !== itemIds.length)) {
    setOrder(shuffledIndices(itemIds.length));
  }

  // Map display index through shuffled order, falling back to sequential
  const effectiveIndex = (order && order.length === itemIds.length) ? order[index] : index;
  const { block: renderedItem, olxJson } = useBlock(props, itemIds[effectiveIndex]);

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

  // 2.5. Edit corner case — if item list changes, index may be out-of-bounds
  if (index < 0 || index >= itemIds.length) { setIndex(0); index = 0; }

  // 3. Navigation
  const handlePrev = () => {
    if (index > 0) setIndex(index - 1);
    else if (wrap) setIndex(itemIds.length - 1);
  };
  const handleNext = () => {
    if (index < itemIds.length - 1) setIndex(index + 1);
    else if (wrap) setIndex(0);
  };

  // 4. Title — sync to Redux for Ref/expression access
  const title = olxJson?.attributes?.title || itemIds[effectiveIndex];
  if (title !== value) setValue(title);

  // 5. Render
  return (
    <div className="lo-carousel">
      <div className="lo-carousel__header">
        {!isReadonly && (
          <button onClick={handlePrev} disabled={!wrap && index === 0}
            className="lo-carousel__nav lo-carousel__nav--prev" aria-label="Previous">
            <NavArrow direction="back" />
          </button>
        )}
        <div className="lo-carousel__indicator">
          <span className="lo-carousel__title">{title}</span>
          <span className="lo-carousel__count">{index + 1} of {itemIds.length}</span>
        </div>
        {!isReadonly && (
          <button onClick={handleNext} disabled={!wrap && index === itemIds.length - 1}
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
