// packages/shared/components/blocks/input/FormulaInput.ts
//
// Text input with live KaTeX-rendered preview for math expressions.
// Supports variable/function whitelisting and case sensitivity.

import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { placeholder } from '@/lib/blocks/attributeSchemas';
import _FormulaInput from './_FormulaInput';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const FormulaInput = core({
  ...parsers.blocks(),
  ...input(),
  name: 'FormulaInput',
  description: 'Math expression input with live LaTeX preview (supports variables, functions, operators)',
  component: _FormulaInput,
  fields,
  selectValue: (props: RuntimeProps, state, _stateKey) => fieldSelector(state, props, fields.value, { fallback: '' }),
  attributes: z.object({
    ...placeholder,
    variables: z.string().optional().describe('Comma-separated variable names allowed in expressions (e.g. "x,y,z")'),
    functions: z.string().optional().describe('Comma-separated function names allowed in expressions (e.g. "f,g")'),
    caseSensitive: z.string().optional().describe('Whether variable/function names are case-sensitive (default: false)'),
    trailingText: z.string().optional().describe('Text shown after the input (e.g. units like "m/s")'),
    size: z.string().optional().describe('Input width in characters'),
  }).strict(),
});

export default FormulaInput;
