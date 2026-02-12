// src/components/blocks/authoring/CodeInput/CodeInput.ts
//
// CodeInput block - a CodeMirror-based code editor as an OLX block.
//
// Provides syntax-highlighted editing with the value stored in Redux,
// readable by other blocks (e.g., OlxSlot for live preview).
//
// Default language is OLX (XML syntax highlighting).
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _CodeInput from './_CodeInput';

export const fields = state.fields([commonFields.value]);

const CodeInput = test({
  ...parsers.text({ postprocess: 'none' }),
  name: 'CodeInput',
  isInput: true,
  description: 'CodeMirror-based code editor with syntax highlighting, usable as an OLX block',
  component: _CodeInput,
  fields,
  getValue: ((props, reduxState, id) => {
    const fieldValue = fieldSelector(reduxState, props, fields.value, { fallback: null, id });
    return fieldValue ?? props.kids ?? null;
  }) as any,
  attributes: baseAttributes.extend({
    language: z.enum(['olx', 'xml', 'md', 'markdown']).default('olx')
      .describe('Syntax highlighting language'),
    height: z.string().default('300px')
      .describe('Editor height (CSS value)'),
    theme: z.enum(['light', 'dark']).default('light')
      .describe('Editor color theme'),
  }),
});

export default CodeInput;
