import { debug, Trace } from '@/lib/debug';

import { render } from '@/lib/render';

import TextBlock from '@/components/blocks/TextBlock';
import QuestionBlock from '@/components/blocks/QuestionBlock';
import ProblemBlock from '@/components/blocks/ProblemBlock';
import Lesson from '@/components/blocks/Lesson';
import React from 'react';

import { dev } from './blocks';
const warnedBlocks = new Set();

export function createStubBlock(name) {
  return dev({
    name,
    component: ({ id, ...props }) => {
      if (!warnedBlocks.has(name)) {
        console.warn(`[StubBlock] "${name}" is not yet implemented.`);
        warnedBlocks.add(name);
      }

      const summarizeValue = (value) => {
        if (value == null) return 'null';
        if (typeof value === 'string') {
          return value.length > 80 ? `"${value.slice(0, 80)}..."` : `"${value}"`;
        }
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) return `[Array(${value.length})]`;
        if (typeof value === 'object') return '{Object}';
        return typeof value;
      };

      const summaryLines = Object.entries(props).map(([key, value]) => (
        <div key={key} className="ml-2">
          <span className="text-gray-500">{key}:</span> {summarizeValue(value)}
        </div>
      ));

      return (
        <div
          className="border border-gray-300 bg-gray-50 rounded-md p-2 my-2 shadow-sm text-xs text-gray-700 font-mono whitespace-pre-wrap"
          data-stub={name}
        >
          <div className="border-b border-gray-200 mb-1 pb-1 flex items-center gap-2">
            <span className="text-sm font-bold text-blue-600">🛠️ Stub: {name}</span>
            <span className="text-gray-400">(ID: {id ?? 'n/a'})</span>
          </div>

          {Object.keys(props).length > 0 && (
            <details>
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                Show props ({Object.keys(props).length})
              </summary>
              <div className="mt-1">{summaryLines}</div>
            </details>
          )}
        </div>
      );
    },
    parser: () => null,
  });
}


// Block registry
export const COMPONENT_MAP = {
  TextBlock,
  QuestionBlock,
  Lesson,
  ProblemBlock,
  TextInput: createStubBlock('TextInput', 'org.mitros.dev'),
  LLMButton: createStubBlock('LLMButton', 'org.mitros.dev'),
  LLMFeedback: createStubBlock('LLMFeedback', 'org.mitros.dev'),
  LLMPrompt: createStubBlock('LLMPrompt', 'org.mitros.dev'),
  Element: createStubBlock('Element', 'org.mitros.dev'),
  SideBarPanel: createStubBlock('SideBarPanel', 'org.mitros.dev'),
  MainPane: createStubBlock('MainPane', 'org.mitros.dev'),
};
