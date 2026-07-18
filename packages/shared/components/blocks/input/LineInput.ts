// packages/shared/components/blocks/input/LineInput.ts
import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { placeholder } from '@/lib/blocks/attributeSchemas';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

// HTML input types per MDN. We support a subset that makes sense for educational content.
// Full list: button, checkbox, color, date, datetime-local, email, file, hidden, image,
// month, number, password, radio, range, reset, search, submit, tel, text, time, url, week
// Deprecated: datetime
//
// TODO: Consider adding support for: color, range, month, week (less common but potentially useful)
// Not supported: button, submit, reset (action buttons), checkbox, radio (use dedicated components),
// file (different use case), hidden, image (not text inputs)
const INPUT_TYPES = ['text', 'number', 'email', 'tel', 'url', 'password', 'search', 'date', 'time', 'datetime-local'] as const;

const LineInput = core({
  ...parsers.blocks(),
  name: 'LineInput',
  ...input({ valueSchema: z.string() }),
  description: 'Single-line text input field for student responses',
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => fieldSelector(state, props, fields.value, { fallback: '' }),
  },
  attributes: z.object({
    ...placeholder,
    min: z.string().optional().describe('Minimum allowed value (for numeric types)'),
    max: z.string().optional().describe('Maximum allowed value (for numeric types)'),
    step: z.string().optional().describe('Step increment (for numeric types)'),
    type: z.enum(INPUT_TYPES).optional().describe('HTML input type'),
  }).strict(),
});

export default LineInput;
