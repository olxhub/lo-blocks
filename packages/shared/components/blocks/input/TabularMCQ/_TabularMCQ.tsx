// packages/shared/components/blocks/input/TabularMCQ/_TabularMCQ.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';
import { useGraderAnswer } from '@/lib/player/useGraderAnswer';
import { assertNamedObject } from '@/lib/types/kids';

export default function TabularMCQ(props: RuntimeProps) {
  const { fields, kids } = props;
  assertNamedObject(kids, ['type', 'parsed', 'message', 'technical']);

  // State: { rowId: colIndex } for radio, { rowId: [colIndex, ...] } for checkbox
  const [value, setValue] = useFieldState(props, fields.value, {});

  // Show answer support - displayAnswer is { rowId: number[] }
  const { showAnswer, displayAnswer } = useGraderAnswer(props);

  // Check for parse failure (YAML or validation error)
  if (props.parseError) {
    return (
      <DisplayError
        props={props}
        title="TabularMCQ Parse Error"
        message={String(kids.message || "Failed to parse TabularMCQ content")}
        technical={kids.technical ? JSON.stringify(kids.technical, null, 2) : undefined}
      />
    );
  }

  // Parser produces { type: 'parsed', parsed: {...} }
  if (!kids || !kids.parsed) {
    return (
      <DisplayError
        props={props}
        title="TabularMCQ Error"
        message="No content provided"
        technical={`Expected YAML content inside <TabularMCQ>:\ncols: Col1, Col2, Col3\nrows: Row1, Row2, Row3\n\nReceived: ${JSON.stringify(kids, null, 2)}`}
      />
    );
  }

  const parsed = kids.parsed as any;
  const mode = parsed.mode || 'radio';
  const rows = parsed.rows;
  const cols = parsed.cols;

  // Validate rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <DisplayError
        props={props}
        title="TabularMCQ Error"
        message="No rows defined"
        technical={`Add rows to your content:\nrows: Item1, Item2, Item3\n\nParsed data: ${JSON.stringify(parsed, null, 2)}`}
      />
    );
  }

  // Validate cols
  if (!Array.isArray(cols) || cols.length === 0) {
    return (
      <DisplayError
        props={props}
        title="TabularMCQ Error"
        message="No columns defined"
        technical={`Add columns to your content:\ncols: Col1, Col2, Col3\n\nParsed data: ${JSON.stringify(parsed, null, 2)}`}
      />
    );
  }

  const handleRadioChange = (rowId, colIndex) => {
    setValue({
      ...value,
      [rowId]: colIndex
    });
  };

  const handleCheckboxChange = (rowId, colIndex) => {
    const current = value[rowId] || [];
    const newSelection = current.includes(colIndex)
      ? current.filter(idx => idx !== colIndex)
      : [...current, colIndex].sort((a, b) => a - b);

    setValue({
      ...value,
      [rowId]: newSelection
    });
  };

  const isChecked = (rowId, colIndex) => {
    if (mode === 'checkbox') {
      return (value[rowId] || []).includes(colIndex);
    }
    return value[rowId] === colIndex;
  };

  return (
    <div className="tabular-mcq">
      <table>
        <thead>
          <tr>
            <th>{props.title}</th>
            {cols.map((col, colIndex) => (
              <th key={col.id || colIndex}>
                {col.text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.text}</td>
              {cols.map((col, colIndex) => {
                const inputId = `${props.id}-${row.id}-${colIndex}`;
                const correctIndices = showAnswer ? displayAnswer?.[row.id] : undefined;
                const isCorrectCell = correctIndices !== undefined && correctIndices.includes(colIndex);
                const isWrongSelection = correctIndices !== undefined && !isCorrectCell && isChecked(row.id, colIndex);
                const cellClass = isCorrectCell ? 'tabular-mcq-correct' : isWrongSelection ? 'tabular-mcq-wrong' : '';
                return (
                  <td key={col.id || colIndex} className={cellClass}>
                    <label htmlFor={inputId}>
                      <input
                        id={inputId}
                        type={mode === 'checkbox' ? 'checkbox' : 'radio'}
                        name={mode === 'radio' ? `tabular-mcq-row-${props.id}-${row.id}` : undefined}
                        checked={isChecked(row.id, colIndex)}
                        onChange={() =>
                          mode === 'checkbox'
                            ? handleCheckboxChange(row.id, colIndex)
                            : handleRadioChange(row.id, colIndex)
                        }
                      />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
