// src/components/blocks/_ChoiceItem.jsx
'use client';

import React from 'react';
import { useFieldSelector, updateReduxField } from '@/lib/state';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { fields as choiceFields } from './ChoiceInput/ChoiceInput';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

export default function _ChoiceItem(props) {
  const parentIds = inferRelatedNodes(props, {
    selector: n => n.node.tag === 'ChoiceInput',
    infer: ['parents']
  });
  const parentId = parentIds[0];
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

  const checked = selected === props.id;

  const handleChange = () => {
    updateReduxField(props, choiceFields.fieldInfoByField.value, props.id, { id: parentId });
  };

  return (
    <label className="block">
      <input
        type="radio"
        name={parentId}
        checked={checked}
        onChange={handleChange}
        className="mr-1"
      />
      {renderCompiledKids(props)}
    </label>
  );
}
