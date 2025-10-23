// src/components/blocks/_LikertScale.jsx
'use client';

import React, { useMemo } from 'react';
import { useReduxState } from '@/lib/state';
import { render } from '@/lib/render';

const DEFAULT_SCALE = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree'
];

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lower)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(lower)) return false;
  }
  return defaultValue;
}

function parseScaleOptions({ scale, options, labels, scaleDelimiter }) {
  const source = scale ?? options ?? labels;
  if (!source) {
    return DEFAULT_SCALE;
  }

  const delimiter = typeof scaleDelimiter === 'string' && scaleDelimiter.length > 0
    ? scaleDelimiter
    : (source.includes('|') ? '|' : ',');

  const parsed = source
    .split(delimiter)
    .map(option => option.trim())
    .filter(option => option.length > 0);

  return parsed.length > 0 ? parsed : DEFAULT_SCALE;
}

// TODO this function doesn't really work in our context
// it might be more practical to render the block
function extractStatementLabel(childBlock, fallback) {
  if (!childBlock) return fallback;
  const { attributes = {} } = childBlock;
  return (
    attributes.label ||
    attributes.title ||
    attributes.name ||
    attributes.question ||
    fallback
  );
}

function _LikertScale(props) {
  const {
    kids = [],
    idMap,
    fields,
    componentMap,
    nodeInfo,
    title,
    description,
    scale,
    options,
    labels,
    scaleDelimiter,
    summaryHeading = 'Selections',
    id: componentId,
    allowReset = true,
    readOnly: readOnlyProp,
    showSummary = true
  } = props;

  const defaultResponses = useMemo(() => ({}), []);
  const [responses = defaultResponses, setResponses] = useReduxState(
    props,
    fields.responses,
    defaultResponses
  );

  const scaleOptions = useMemo(
    () => parseScaleOptions({ scale, options, labels, scaleDelimiter }),
    [scale, options, labels, scaleDelimiter]
  );

  const readOnly = useMemo(() => normalizeBoolean(readOnlyProp, false), [readOnlyProp]);
  const summaryEnabled = useMemo(() => normalizeBoolean(showSummary, true), [showSummary]);
  const resetEnabled = useMemo(() => normalizeBoolean(allowReset, true), [allowReset]);

  const statements = useMemo(() => {
    return kids
      .filter(child => child && typeof child === 'object' && child.type === 'block')
      .map((child, index) => {
        const block = idMap?.[child.id];
        console.log(child, block);
        const label = extractStatementLabel(block, `Statement ${index + 1}`);
        return {
          id: child.id,
          child,
          label
        };
      });
  }, [kids, idMap]);

  const handleSelect = (statementId, option, optionIndex) => {
    if (readOnly) return;
    const next = {
      ...responses,
      [statementId]: {
        value: option,
        index: optionIndex
      }
    };
    setResponses(next);
  };

  const handleReset = () => {
    if (readOnly) return;
    if (Object.keys(responses ?? {}).length === 0) return;
    setResponses({});
  };

  if (statements.length === 0) {
    return (
      <div className="p-4 border border-dashed border-gray-300 rounded-md bg-gray-50 text-sm text-gray-600">
        No statements provided. Add child blocks (e.g., TextBlock or Markdown) inside <code>&lt;LikertScale&gt;</code> to define rows.
      </div>
    );
  }

  return (
    <div className="likert-scale-component border border-gray-200 rounded-lg bg-white shadow-sm">
      {(title || description) && (
        <div className="px-5 py-4 border-b border-gray-200">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Statement
              </th>
              {scaleOptions.map((optionLabel, optionIndex) => (
                <th
                  scope="col"
                  key={`likert-header-${optionIndex}`}
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide"
                >
                  {optionLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {statements.map((statement, rowIndex) => {
              const response = responses?.[statement.id];
              const name = `${componentId || 'LikertScale'}_${statement.id || rowIndex}`;
              return (
                <tr key={statement.id} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <th scope="row" className="px-6 py-4 text-sm font-medium text-gray-900 align-top">
                    <div className="max-w-prose space-y-1">
                      {render({
                        node: statement.child,
                        idMap,
                        nodeInfo,
                        componentMap
                      })}
                    </div>
                  </th>
                  {scaleOptions.map((optionLabel, optionIndex) => {
                    const inputId = `${name}_${optionIndex}`;
                    const isSelected = response?.index === optionIndex;
                    return (
                      <td key={inputId} className="px-4 py-4 text-center">
                        <label className="inline-flex items-center justify-center gap-2">
                          <input
                            id={inputId}
                            type="radio"
                            name={name}
                            value={optionLabel}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                            checked={isSelected}
                            onChange={() => handleSelect(statement.id, optionLabel, optionIndex)}
                            disabled={readOnly}
                          />
                          <span className="sr-only">
                            {`${optionLabel} for ${statement.label}`}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(summaryEnabled || (resetEnabled && !readOnly)) && (
        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
          {summaryEnabled && (
            <div>
              {summaryHeading && (
                <h4 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">{summaryHeading}</h4>
              )}
              <dl className="mt-2 space-y-2">
                {statements.map((statement, index) => {
                  const response = responses?.[statement.id];
                  return (
                    <div key={`summary-${statement.id}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <dt className="text-sm font-medium text-gray-700">
                        {statement.label || `Statement ${index + 1}`}
                      </dt>
                      <dd className="text-sm text-gray-600">
                        {response ? scaleOptions[response.index] : 'No response yet'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}

          {resetEnabled && !readOnly && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Object.keys(responses ?? {}).length === 0}
            >
              Reset responses
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default _LikertScale;
