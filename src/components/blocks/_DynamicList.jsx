// src/components/blocks/_DynamicList.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';

export default function _DynamicList(props) {
  const {
    kids = [],
    fields,
    id,
    idPrefix = '',
    min = 1,
    max = Infinity,
    start = 3,
  } = props;

  const parsedMin = Number(min);
  const parsedMax = max === undefined ? Infinity : Number(max);
  const parsedStart = Number(start);

  const [count, setCount] = useReduxState(props, fields.count, parsedStart);

  const basePrefix = idPrefix ? `${idPrefix}.${id}` : id;

  const handleAdd = () => setCount(Math.min(parsedMax, count + 1));
  const handleRemove = () => setCount(Math.max(parsedMin, count - 1));

  const entries = Array.from({ length: count }, (_, i) => (
    <div key={i} className="mb-2">
      {renderCompiledKids({
        ...props,
        kids,
        idPrefix: `${basePrefix}.${i}`,
      })}
    </div>
  ));

  return (
    <div>
      {entries}
      <div className="space-x-2 mt-2">
        <button onClick={handleRemove} disabled={count <= parsedMin} className="px-2 py-1 border rounded">[-]</button>
        <button onClick={handleAdd} disabled={count >= parsedMax} className="px-2 py-1 border rounded">[+]</button>
      </div>
    </div>
  );
}
