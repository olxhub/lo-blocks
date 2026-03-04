// src/components/blocks/input/DropdownInput/_DropdownSelect.jsx
'use client';

import React, { useCallback, useMemo } from 'react';
import { useFieldSelector, updateField } from '@/lib/state';
import { useGraderAnswer } from '@/lib/blocks';
import { DisplayError } from '@/lib/util/debug';

/**
 * Parse comma-separated options string into options array.
 * Supports: "Red, Green, Blue" or "Red|r, Green|g, Blue|b"
 */
function parseOptionsAttribute(optionsStr) {
  if (!optionsStr) return [];
  return optionsStr.split(',').map(item => {
    const trimmed = item.trim();
    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx >= 0) {
      return {
        text: trimmed.slice(0, pipeIdx).trim(),
        value: trimmed.slice(pipeIdx + 1).trim()
      };
    }
    return { text: trimmed, value: trimmed };
  }).filter(opt => opt.text);
}

export default function _DropdownSelect(props) {
  const { placeholder, kids, options: optionsAttr, fields } = props;

  const parsedOptions = kids?.parsed?.options || [];
  const attrOptions = useMemo(() => parseOptionsAttribute(optionsAttr), [optionsAttr]);

  // Check for conflicting sources
  const hasParsedContent = parsedOptions.length > 0;
  const hasAttrOptions = attrOptions.length > 0;

  if (hasParsedContent && hasAttrOptions) {
    return (
      <DisplayError
        name="DropdownInput"
        message="Cannot specify both content and options attribute"
        data={{ id: props.id }}
      />
    );
  }

  const options = hasParsedContent ? parsedOptions : attrOptions;

  const value = useFieldSelector(
    props,
    fields.value,
    { fallback: '' }
  );

  // Check if grader is showing the answer
  const { showAnswer, displayAnswer } = useGraderAnswer(props);

  const handleChange = useCallback((e) => {
    updateField(props, fields.value, e.target.value);
  }, [props, fields]);

  // Find display text for the correct answer
  const correctOptionText = displayAnswer
    ? options.find(opt => opt.value === displayAnswer)?.text ?? displayAnswer
    : null;

  return (
    <>
      <select
        value={value}
        onChange={handleChange}
        className="border rounded px-2 py-1"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt, idx) => (
          <option key={opt.value || idx} value={opt.value}>
            {opt.text}
          </option>
        ))}
      </select>
      {showAnswer && correctOptionText != null && (
        <span className="lo-show-answer-label">
          Correct: {correctOptionText}
        </span>
      )}
    </>
  );
}
