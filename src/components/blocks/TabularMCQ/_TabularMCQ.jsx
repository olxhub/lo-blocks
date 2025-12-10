// src/components/blocks/TabularMCQ/_TabularMCQ.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

export default function _TabularMCQ(props) {
  const { fields, kids } = props;

  // State: { rowId: colIndex } for radio, { rowId: [colIndex, ...] } for checkbox
  const [value, setValue] = useReduxState(props, fields.value, {});

  // Check for PEG parsing failure (ErrorNode)
  if (props.parseError || (kids && kids.type === 'peg_error')) {
    return (
      <DisplayError
        props={props}
        name="TabularMCQ Parse Error"
        message={kids.message || "Failed to parse TabularMCQ content"}
        technical={kids.technical ? JSON.stringify(kids.technical, null, 2) : undefined}
      />
    );
  }

  // peggyParser always produces { type: 'parsed', parsed: {...} }
  if (!kids || !kids.parsed) {
    return (
      <DisplayError
        props={props}
        name="TabularMCQ Error"
        message="No content provided"
        technical={`Expected PEG syntax inside <TabularMCQ>:\ncols: Col1, Col2, Col3\nrows: Row1, Row2, Row3\n\nReceived: ${JSON.stringify(kids, null, 2)}`}
      />
    );
  }

  const parsed = kids.parsed;
  const mode = parsed.mode || 'radio';
  const rows = parsed.rows;
  const cols = parsed.cols;

  // Validate rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <DisplayError
        props={props}
        name="TabularMCQ Error"
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
        name="TabularMCQ Error"
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
      <table className="border-collapse border border-gray-300 w-full">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-100 p-2"></th>
            {cols.map((col, colIndex) => (
              <th key={col.id || colIndex} className="border border-gray-300 bg-gray-100 p-2 text-center">
                {col.text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border border-gray-300 p-2 font-medium">{row.text}</td>
              {cols.map((col, colIndex) => (
                <td key={col.id || colIndex} className="border border-gray-300 p-2 text-center">
                  <input
                    type={mode === 'checkbox' ? 'checkbox' : 'radio'}
                    name={mode === 'radio' ? `tabular-mcq-row-${props.id}-${row.id}` : undefined}
                    checked={isChecked(row.id, colIndex)}
                    onChange={() =>
                      mode === 'checkbox'
                        ? handleCheckboxChange(row.id, colIndex)
                        : handleRadioChange(row.id, colIndex)
                    }
                    className="cursor-pointer"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
