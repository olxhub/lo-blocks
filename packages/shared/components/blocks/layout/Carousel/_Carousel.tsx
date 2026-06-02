// _Carousel.tsx - Browse and select from a list of referenced items.
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState, useFieldSelector } from '@/lib/state';
import { useBlock } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import NavArrow from '@/components/common/NavArrow';
import { fisherYatesShuffleInPlace } from '@/lib/util/shuffle';
import { assertNamedObject } from '@/lib/util/kids';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';
import { stateKeyForGlobalRef , PLACEHOLDER_NS } from '@/lib/types/id-grammar';
import type { StateRef } from '@/lib/types';

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

export default function _Carousel(props: RuntimeProps) {
  const { id, fields, kids, wrap = false, randomize = false } = props;
  const { t } = useBlockTranslation(props);
  assertNamedObject(kids, ['itemIds']);
  const itemIds = kids.itemIds as string[];

  // 1. Hooks (called unconditionally per React rules)
  // value stores the current item ID; title stores the display name; order stores the display sequence
  const [currentId, setCurrentId] = useFieldState(props, fields.value, null);
  const [order, setOrder] = useFieldState(props, fields.order, null);
  const [title, setTitle] = useFieldState(props, fields.title, '');
  const isReadonly = useFieldSelector(props, fields.readonly, { fallback: props.readonly });

  // Keep order in sync: shuffled when randomize is active, authored order otherwise.
  // Use effectiveOrder so the freshly-computed array is available in this render
  // (Redux won't reflect setOrder until the next render).
  let effectiveOrder = order;
  if (randomize && !isOrderValid(order, itemIds)) {
    effectiveOrder = shuffledIds(itemIds);
    setOrder(effectiveOrder);
  } else if (!randomize && (!order || !itemIds.every((id, i) => order[i] === id))) {
    effectiveOrder = [...itemIds];
    setOrder(effectiveOrder);
  }

  const displayOrder = isOrderValid(effectiveOrder, itemIds) ? effectiveOrder : itemIds;
  let position = currentId ? displayOrder.indexOf(currentId) : 0;
  if (position < 0) position = 0;

  // Sync value field if unset or stale
  if (displayOrder[position] !== currentId) {
    setCurrentId(displayOrder[position]);
  }

  const currentRef = displayOrder[position] as StateRef;
  const { block: renderedItem, olxJson } = useBlock(props, stateKeyForGlobalRef(currentRef, props.runtime?.ns ?? PLACEHOLDER_NS));

  // 2. No items — early exit
  if (itemIds.length === 0) {
    return (
      <DisplayError props={props} title="Carousel"
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
      <div className="lo-carousel__body">
        {!isReadonly && (
          <button onClick={handlePrev} disabled={!wrap && position === 0}
            className="lo-carousel__nav lo-carousel__nav--prev" aria-label={t('previous')}>
            <NavArrow direction="back" className="w-6 h-6" />
          </button>
        )}
        <div className="lo-carousel__center">
          <div className="lo-carousel__header">
            <div className="lo-carousel__title">{displayTitle}</div>
            <div className="lo-carousel__count">{t('progress', { current: position + 1, total: numItems })}</div>
          </div>
          <div className="lo-carousel__content">
            {renderedItem}
          </div>
        </div>
        {!isReadonly && (
          <button onClick={handleNext} disabled={!wrap && position === numItems - 1}
            className="lo-carousel__nav lo-carousel__nav--next" aria-label={t('next')}>
            <NavArrow direction="forward" className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
