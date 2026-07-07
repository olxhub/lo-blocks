// packages/shared/components/blocks/input/ChoiceInput/_ChoiceItem.tsx
//
// Shared UI component for Key and Distractor elements.
// Renders as radio button under ChoiceInput, checkbox under CheckboxInput.
//
// Kids are block references (from blocks() parser or MarkupProblem's generated
// Markdown blocks). Rendered via renderCompiledKids.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useMemo } from 'react';
import * as state from '@/lib/state';
import { value as valueFieldCommon } from '@/lib/state/commonFields';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { inferRelatedNodes, useGraderAnswer } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';
import { useKids } from '@/lib/render';

export default function ChoiceItem(props: RuntimeProps) {
  // Find parent input - could be ChoiceInput (radio) or CheckboxInput (checkbox)
  const { parentId, isCheckbox } = useMemo(() => {
    // First try CheckboxInput
    const checkboxParents = inferRelatedNodes(props, {
      selector: n => n.loBlock.name === 'CheckboxInput',
      infer: ['parents']
    });
    if (checkboxParents.length > 0) {
      return { parentId: checkboxParents[0], isCheckbox: true };
    }

    // Fall back to ChoiceInput
    const choiceParents = inferRelatedNodes(props, {
      selector: n => n.loBlock.name === 'ChoiceInput',
      infer: ['parents']
    });
    return { parentId: choiceParents[0], isCheckbox: false };
  // props intentionally omitted: structural relationships are stable once rendered
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // parentId is already a StateKey from inferRelatedNodes. When no parent is
  // found, fall back to the block's own key + the global value field for hook
  // stability — the value is unused since we render DisplayError below.
  const parentStateKey = parentId ?? scopedStateKeyForBlock(props);

  // Get the parent input's value field dynamically
  const valueField = parentId
    ? state.componentFieldByStateKey(props, parentId, 'value')
    : valueFieldCommon;
  // For checkboxes, fallback to empty array; for radio, fallback to empty string
  const selected = state.useFieldSelector(
    props,
    valueField,
    { stateKey: parentStateKey, fallback: isCheckbox ? [] : '' }
  );

  // Check if grader is showing the answer
  const { showAnswer } = useGraderAnswer(props);
  const isKey = props.loBlock.name === 'Key';
  const showCorrectHighlight = showAnswer && isKey;

  const itemValue = props.value ?? props.id;

  // For checkboxes, check if value is in the array; for radio, check equality
  const checked = isCheckbox
    ? Array.isArray(selected) && (selected as any[]).includes(itemValue)
    : selected === itemValue;

  const handleChange = () => {
    if (isCheckbox) {
      // Toggle: add or remove from array
      const currentSelection: any[] = Array.isArray(selected) ? selected : [];
      const newSelection = currentSelection.includes(itemValue)
        ? currentSelection.filter(v => v !== itemValue)
        : [...currentSelection, itemValue];
      state.updateField(props, valueField, newSelection, { stateKey: parentStateKey });
    } else {
      // Radio: set single value
      state.updateField(props, valueField, itemValue, { stateKey: parentStateKey });
    }
  };

  // Radio button name needs the scoped ID for proper grouping
  const scopedParentId = parentStateKey;

  const { kids: renderedKids } = useKids(props);

  if (!parentId) {
    return (
      <DisplayError title="ChoiceItem" message="No parent ChoiceInput or CheckboxInput found" data={{ id: props.id }} />
    );
  }

  const labelClasses = [
    'lo-choice-item',
    checked && 'lo-choice-item--selected',
    isCheckbox ? 'lo-choice-item--checkbox' : 'lo-choice-item--radio',
    showCorrectHighlight && 'lo-choiceinput-show-answer',
  ].filter(Boolean).join(' ');

  return (
    <label className={labelClasses}>
      <input
        type={isCheckbox ? 'checkbox' : 'radio'}
        name={scopedParentId}
        checked={checked}
        onChange={handleChange}
        className="lo-choice-item__input"
      />
      <span className="lo-choice-item__indicator" aria-hidden="true" />
      <span className="lo-choice-item__text">{renderedKids}</span>
    </label>
  );
}
