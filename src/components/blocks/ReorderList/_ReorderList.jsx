// src/components/blocks/ReorderList/_ReorderList.jsx
'use client';

import React, { useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';

export default function _ReorderList(props) {
  const { kids = [], fields, idPrefix = '' } = props;

  const initialOrder = kids.map((_, i) => i);
  const [order, setOrder] = useReduxState(props, fields.order, initialOrder);

  const dragIndex = useRef(null);

  const handleDragStart = index => () => {
    dragIndex.current = index;
  };

  const handleDragOver = index => event => {
    event.preventDefault();
  };

  const handleDrop = index => event => {
    event.preventDefault();
    if (dragIndex.current === null) return;
    const start = dragIndex.current;
    if (start === index) return;
    const newOrder = [...order];
    const [moved] = newOrder.splice(start, 1);
    newOrder.splice(index, 0, moved);
    dragIndex.current = null;
    setOrder(newOrder);
  };

  const orderedKids = order.map(i => kids[i]);

  return (
    <div>
      {orderedKids.map((child, i) => (
        <div
          key={order[i]}
          draggable
          onDragStart={handleDragStart(i)}
          onDragOver={handleDragOver(i)}
          onDrop={handleDrop(i)}
          className="p-2 border rounded mb-2 bg-white"
        >
          {renderCompiledKids({ ...props, kids: [child], idPrefix: `${idPrefix}.${i}` })}
        </div>
      ))}
    </div>
  );
}
