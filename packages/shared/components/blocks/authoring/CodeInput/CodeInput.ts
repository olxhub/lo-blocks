// src/components/blocks/authoring/CodeInput/CodeInput.ts
//
// EXPERIMENTAL / PROTOTYPE
//
// CodeInput - a CodeMirror editor as an OLX block. Exploring patterns for
// in-browser code/OLX editing. API will likely change.
//
import { z } from 'zod';
import { test, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';
import _CodeInput from './_CodeInput';

export const fields = state.fields([commonFields.value]);

const CodeInput = test({
  ...parsers.text.raw(),
  ...input(),
  name: 'CodeInput',
  description: 'Experimental: CodeMirror editor for in-browser code editing',
  component: _CodeInput,
  fields,
  selectValue: ((props, reduxState, _reduxKey) => {
    const fieldValue = fieldSelector(reduxState, props, fields.value, { fallback: null });
    return fieldValue ?? props.kids ?? null;
  }) as any,
  attributes: baseAttributes.extend({
    language: z.enum(['olx', 'xml', 'md', 'markdown', ...PEG_CONTENT_EXTENSIONS]).default('olx')
      .describe('Syntax highlighting language (includes all PEG content formats)'),
    height: z.string().default('300px')
      .describe('Editor height (CSS value)'),
  }),
});

export default CodeInput;
