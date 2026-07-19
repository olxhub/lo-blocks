// packages/shared/components/blocks/input/ChoiceInput/_ChoiceItem.tsx
//
// Shared UI component for Key and Distractor elements.
// Renders as radio button under ChoiceInput, checkbox under CheckboxInput.
//
// Kids are block references (from blocks() parser or MarkupProblem's generated
// Markdown blocks). Rendered via renderCompiledKids.
//
// The parent input's identity (its StateKey, and whether it is single- or
// multi-select) arrives through ChoiceGroupContext, provided by _ChoiceGroup.
// The item does NOT search its rendered ancestors for the parent — that
// discovery was fragile across render entries. See ChoiceGroupContext.
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useContext } from 'react';
import * as state from '@/lib/state';
import { value as valueFieldCommon } from '@/lib/state/commonFields';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { useGraderAnswer } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';
import { useKids } from '@/lib/render';
import { ChoiceGroupContext } from './ChoiceGroupContext';

export default function ChoiceItem(props: RuntimeProps) {
  // The parent ChoiceInput/CheckboxInput passes its identity down. null means
  // this Key/Distractor was rendered outside any choice input — we render a
  // DisplayError below (hooks still run first, for hook-order stability).
  const group = useContext(ChoiceGroupContext);

  // When orphaned, fall back to the block's own key + the global value field
  // so the hooks below stay valid; the value read is unused since we bail out
  // to DisplayError.
  const parentStateKey = group?.parentStateKey ?? scopedStateKeyForBlock(props);
  const isCheckbox = group?.isCheckbox ?? false;

  // The parent input's value field, read/written under the parent's StateKey.
  const valueField = group
    ? state.componentFieldByStateKey(props, parentStateKey, 'value')
    : valueFieldCommon;
  // Checkboxes store an array of selected values; radios store a single string.
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

  // For checkboxes, check membership in the array; for radio, check equality.
  const checked = isCheckbox
    ? Array.isArray(selected) && (selected as any[]).includes(itemValue)
    : selected === itemValue;

  const handleChange = () => {
    if (isCheckbox) {
      // Toggle: add or remove from the array.
      const currentSelection: any[] = Array.isArray(selected) ? selected : [];
      const newSelection = currentSelection.includes(itemValue)
        ? currentSelection.filter(v => v !== itemValue)
        : [...currentSelection, itemValue];
      state.updateField(props, valueField, newSelection, { stateKey: parentStateKey });
    } else {
      // Radio: set the single value.
      state.updateField(props, valueField, itemValue, { stateKey: parentStateKey });
    }
  };

  const { kids: renderedKids } = useKids(props);

  if (!group) {
    return (
      <DisplayError title="ChoiceItem" message="Key/Distractor must be inside a ChoiceInput or CheckboxInput" data={{ id: props.id }} />
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
        // The parent's StateKey groups sibling radios (and is a stable,
        // scoped name for checkboxes).
        name={parentStateKey}
        checked={checked}
        onChange={handleChange}
        className="lo-choice-item__input"
      />
      <span className="lo-choice-item__indicator" aria-hidden="true" />
      <span className="lo-choice-item__text">{renderedKids}</span>
    </label>
  );
}
