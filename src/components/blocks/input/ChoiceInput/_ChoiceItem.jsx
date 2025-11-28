// src/components/blocks/ChoiceInput/_ChoiceItem.jsx
'use client';

import React, { useMemo } from 'react';
import { useFieldSelector, updateReduxField } from '@/lib/state';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { fields as choiceFields } from './ChoiceInput';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

export default function _ChoiceItem(props) {
  const parentIds = useMemo(() => {
    return inferRelatedNodes(props, {
      selector: n => n?.blueprint?.name === 'ChoiceInput',
      infer: ['parents']
    });
  // props intentionally omitted: structural relationships are stable once rendered, so we need
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO: Make sure there is only one parent
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

  const itemValue = props.value ?? props.id;
  const checked = selected === itemValue;

  const handleChange = () => {
    updateReduxField(props, choiceFields.fieldInfoByField.value, itemValue, { id: parentId });
  };

  return (
    <label className="block">
      <input
        type="radio"
        name={parentId}
        checked={checked}
        onChange={handleChange}
       />
      {renderCompiledKids(props)}
    </label>
  );
}
