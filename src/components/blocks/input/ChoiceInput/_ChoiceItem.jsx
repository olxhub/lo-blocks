// src/components/blocks/ChoiceInput/_ChoiceItem.jsx
//
// Shared UI component for Key and Distractor elements.
// Renders as radio button under ChoiceInput, checkbox under CheckboxInput.
//
'use client';

import React, { useMemo } from 'react';
import { useFieldSelector, updateReduxField } from '@/lib/state';
import { inferRelatedNodes, useGraderAnswer } from '@/lib/blocks';
import { refToReduxKey } from '@/lib/blocks/idResolver';
import { fields as choiceFields } from './ChoiceInput';
import { DisplayError } from '@/lib/util/debug';

export default function _ChoiceItem(props) {
  // Find parent input - could be ChoiceInput (radio) or CheckboxInput (checkbox)
  const { parentId, isCheckbox } = useMemo(() => {
    // First try CheckboxInput
    const checkboxParents = inferRelatedNodes(props, {
      selector: n => n.blueprint.name === 'CheckboxInput',
      infer: ['parents']
    });
    if (checkboxParents.length > 0) {
      return { parentId: checkboxParents[0], isCheckbox: true };
    }

    // Fall back to ChoiceInput
    const choiceParents = inferRelatedNodes(props, {
      selector: n => n.blueprint.name === 'ChoiceInput',
      infer: ['parents']
    });
    return { parentId: choiceParents[0], isCheckbox: false };
  // props intentionally omitted: structural relationships are stable once rendered
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!parentId) {
    return (
      <DisplayError name="ChoiceItem" message="No parent ChoiceInput or CheckboxInput found" data={{ id: props.id }} />
    );
  }

  // useFieldSelector and updateReduxField automatically apply idPrefix to the id override
  // For checkboxes, fallback to empty array; for radio, fallback to empty string
  const selected = useFieldSelector(
    props,
    choiceFields.fieldInfoByField.value,
    { id: parentId, fallback: isCheckbox ? [] : '' }
  );

  // Check if grader is showing the answer
  const { showAnswer } = useGraderAnswer(props);
  const isKey = props.blueprint.name === 'Key';
  const showCorrectHighlight = showAnswer && isKey;

  const itemValue = props.value ?? props.id;

  // For checkboxes, check if value is in the array; for radio, check equality
  const checked = isCheckbox
    ? Array.isArray(selected) && selected.includes(itemValue)
    : selected === itemValue;

  const handleChange = () => {
    if (isCheckbox) {
      // Toggle: add or remove from array
      const currentSelection = Array.isArray(selected) ? selected : [];
      const newSelection = currentSelection.includes(itemValue)
        ? currentSelection.filter(v => v !== itemValue)
        : [...currentSelection, itemValue];
      updateReduxField(props, choiceFields.fieldInfoByField.value, newSelection, { id: parentId });
    } else {
      // Radio: set single value
      updateReduxField(props, choiceFields.fieldInfoByField.value, itemValue, { id: parentId });
    }
  };

  // Radio button name needs the scoped ID for proper grouping
  const scopedParentId = refToReduxKey({ ...props, id: parentId });

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
        type={isCheckbox ? 'checkbox' : 'radio'}
        name={scopedParentId}
        checked={checked}
        onChange={handleChange}
       />
      {kids}
    </label>
  );
}
