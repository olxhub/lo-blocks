// src/components/blocks/_DynamicList.jsx
'use client';

import React, { use } from 'react';
import { useReduxState } from '@/lib/state';
import { extendIdPrefix } from '@/lib/blocks/idResolver';
import { render } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

export default function _DynamicList(props) {
  const {
    fields,
    id,
    min = 1,
    max = Infinity,
    start = 3,
  } = props;

  const parsedMin = Number(min);
  const parsedMax = max === undefined ? Infinity : Number(max);
  const parsedStart = Number(start);

  const [count, setCount] = useReduxState(props, fields.count, parsedStart);

  const handleAdd = () => setCount(Math.min(parsedMax, count + 1));
  const handleRemove = () => setCount(Math.max(parsedMin, count - 1));

  // DynamicList expects exactly one child (the template to repeat)
  const template = props.kids?.[0];
  if (!template) {
    return (
      <DisplayError
        id={id}
        name="DynamicList"
        message="DynamicList requires a child element to use as a template"
      />
    );
  }
  if (props.kids.length > 1) {
    return (
      <DisplayError
        id={id}
        name="DynamicList"
        message="DynamicList expects exactly one child. Wrap multiple elements in a Vertical or other container."
        data={{ childCount: props.kids.length }}
      />
    );
  }

  // use() must be called unconditionally - batch render all entries
  // Each entry needs different idPrefix, so we use Promise.all
  const renderedEntries = use(
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        render({
          ...props,
          node: template,
          ...extendIdPrefix(props, `${id}.${i}`),
        })
      )
    )
  );

  return (
    <div>
      {renderedEntries.map((entry, i) => (
        <div key={i} className="mb-2">
          {entry}
        </div>
      ))}
      <div className="space-x-2 mt-2">
        <button onClick={handleRemove} disabled={count <= parsedMin} className="px-2 py-1 border rounded">[-]</button>
        <button onClick={handleAdd} disabled={count >= parsedMax} className="px-2 py-1 border rounded">[+]</button>
      </div>
    </div>
  );
}
