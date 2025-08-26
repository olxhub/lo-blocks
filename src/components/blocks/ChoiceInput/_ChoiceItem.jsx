// src/components/blocks/ChoiceInput/_ChoiceItem.jsx
'use client';

import React, { useMemo } from 'react';
import { useFieldSelector, updateReduxField } from '@/lib/state';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { fields as choiceFields } from './ChoiceInput';
import { fields as graderFields } from './KeyGrader';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { renderBlock } from '@/lib/renderHelpers';
import { CORRECTNESS } from '@/lib/blocks';

export default function _ChoiceItem(props) {
  const { kids: originalKids = [] } = props;
  let feedback;
  let kids = originalKids;

  if (Array.isArray(originalKids)) {
    const remaining = [];
    for (const child of originalKids) {
      if (child && child.type === 'block' && props.idMap?.[child.id].tag === 'Feedback') {
        if (Array.isArray(props.idMap?.[child.id].kids)) {
          feedback = props.idMap?.[child.id].kids
            .map(k => {
              if (typeof k === 'string') return k;
              if (k && typeof k === 'object' && k.type === 'text') return k.text;
              return '';
            })
            .join('')
            .trim();
        }
      } else {
        remaining.push(child);
      }
    }
    kids = remaining;
  }
  const parentIds = useMemo(() => {
    return inferRelatedNodes(props, {
      selector: n => n?.blueprint?.name === 'ChoiceInput',
      infer: ['parents']
    });
  // props intentionally omitted: structural relationships are stable once rendered, so we need
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const graderIds = useMemo(() => {
    return inferRelatedNodes(props, {
      selector: n => n?.blueprint?.name === 'KeyGrader',
      infer: ['parents']
    });
  // props intentionally omitted: structural relationships are stable once rendered, so we need
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO: Make sure there is only one parent
  const parentId = parentIds[0];
  const graderId = graderIds[0];
  if (!parentId) {
    return (
      <DisplayError name="ChoiceItem" message="No parent ChoiceInput found" data={{ id: props.id }} />
    );
  }

  const selected = useFieldSelector(
    props,
    choiceFields.fieldInfoByField.value,
    { id: parentId, fallback: '' }
  );

  const graderMessage = useFieldSelector(
    props,
    graderFields.fieldInfoByField.message,
    { id: graderId, fallback: '' }
  );
  const checked = selected === props.id;

  const handleChange = () => {
    updateReduxField(props, choiceFields.fieldInfoByField.value, props.id, { id: parentId });
    if (graderId) {
      updateReduxField(
        props,
        graderFields.fieldInfoByField.correct,
        CORRECTNESS.UNSUBMITTED,
        { id: graderId }
      );
      updateReduxField(
        props,
        graderFields.fieldInfoByField.message,
        '',
        { id: graderId }
      );
    }
  };

  return (
    <label className="block">
      <input
        type="radio"
        name={parentId}
        checked={checked}
        onChange={handleChange}
       />
      {renderCompiledKids({ ...props, kids })}
      {checked && feedback && graderMessage && (
        <div className="mt-2">
          {renderBlock(props, 'StatusText', { targets: graderId, field: 'message' })}
        </div>
      )}
    </label>
  );
}
