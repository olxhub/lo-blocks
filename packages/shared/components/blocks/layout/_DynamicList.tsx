// packages/shared/components/blocks/layout/_DynamicList.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { extendIdPrefix, scopeMarker, scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { useKids } from '@/lib/render';
import { useInstanceState } from '@/lib/blocks/useRenderedBlock';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { assertKidArray } from '@/lib/util/kids';

// Each entry renders independently - avoids Promise.all suspense issues
function DynamicListEntry({ props, template, index, id }) {
  const { idPrefix: itemIdPrefix } = extendIdPrefix(props, [id, scopeMarker(index)]);

  // FIXME: Should not spread runtime like this - need proper scoped runtime factory
  // Components should treat runtime as black box. Only idPrefix changes at boundaries.
  const itemRuntime = { ...props.runtime, idPrefix: itemIdPrefix };

  // THE STATE GATE. This instance's keys (template block + its static
  // descendants, scoped by list:#index) exist only in student state —
  // the content response cannot have bundled them. Hold rendering until
  // the state lane resolves them (adopted or confirmed absent): an
  // entry rendered early could write-from-empty and discard the stored
  // bucket on adopt.
  const rootKey = template?.type === 'block'
    ? scopedStateKeyForBlock({ id: template.id, ns: props.runtime.ns, idPrefix: itemIdPrefix })
    : null;
  const gate = useInstanceState({ ...props, runtime: itemRuntime }, rootKey);

  const { kids } = useKids({
    ...props,
    kids: [template],
    runtime: itemRuntime,
  });
  if (gate.loading) {
    return <div className="mb-2"><Spinner>{`Loading item ${index + 1}...`}</Spinner></div>;
  }
  if (gate.error) {
    return (
      <DisplayError
        id={`${id}-item-${index}`}
        title="DynamicList"
        message={gate.error}
        data={{ rootKey }}
      />
    );
  }
  return <div className="mb-2">{kids}</div>;
}

export default function DynamicList(props: RuntimeProps) {
  assertKidArray(props.kids);
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

  const [count, setCount] = useFieldState(props, fields.count, parsedStart);

  const handleAdd = () => setCount(Math.min(parsedMax, count + 1));
  const handleRemove = () => setCount(Math.max(parsedMin, count - 1));

  // DynamicList expects exactly one child (the template to repeat)
  const template = props.kids?.[0];
  if (!template) {
    return (
      <DisplayError
        id={id}
        title="DynamicList"
        message="DynamicList requires a child element to use as a template"
      />
    );
  }
  if (props.kids.length > 1) {
    return (
      <DisplayError
        id={id}
        title="DynamicList"
        message="DynamicList expects exactly one child. Wrap multiple elements in a Vertical or other container."
        data={{ childCount: props.kids.length }}
      />
    );
  }

  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <DynamicListEntry key={i} props={props} template={template} index={i} id={id} />
      ))}
      <div className="space-x-2 mt-2">
        <button onClick={handleRemove} disabled={count <= parsedMin} className="px-2 py-1 border rounded">[-]</button>
        <button onClick={handleAdd} disabled={count >= parsedMax} className="px-2 py-1 border rounded">[+]</button>
      </div>
    </div>
  );
}
