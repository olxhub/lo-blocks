// src/components/blocks/ChoiceInput/_ChoiceItem.jsx
'use client';

import React, { useMemo } from 'react';
import { useFieldSelector, updateReduxField } from '@/lib/state';
import { inferRelatedNodes, useGraderAnswer } from '@/lib/blocks';
import { reduxId } from '@/lib/blocks/idResolver';
import { fields as choiceFields } from './ChoiceInput';
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

  // useFieldSelector and updateReduxField automatically apply idPrefix to the id override
  const selected = useFieldSelector(
    props,
    choiceFields.fieldInfoByField.value,
    { id: parentId, fallback: '' }
  );

  // Check if grader is showing the answer
  const { showAnswer } = useGraderAnswer(props);
  const isKey = props.blueprint?.name === 'Key';
  const showCorrectHighlight = showAnswer && isKey;

  const itemValue = props.value ?? props.id;
  const checked = selected === itemValue;

  const handleChange = () => {
    updateReduxField(props, choiceFields.fieldInfoByField.value, itemValue, { id: parentId });
  };

  // Radio button name needs the scoped ID for proper grouping
  const scopedParentId = reduxId({ ...props, id: parentId });

  // TODO: Key/Distractor currently use parsers.text() which only supports string content.
  // To support images or rich content in choices, they should use parsers.blocks() or
  // a mixed content parser, and this component should use renderCompiledKids instead.
  const { kids } = props;

  const labelClasses = [
    'block',
    showCorrectHighlight && 'lo-choiceinput-show-answer',
  ].filter(Boolean).join(' ');

  return (
    <label className={labelClasses}>
      <input
        type="radio"
        name={scopedParentId}
        checked={checked}
        onChange={handleChange}
       />
      {kids}
    </label>
  );
}
