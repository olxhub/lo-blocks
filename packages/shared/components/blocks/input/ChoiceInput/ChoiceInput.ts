// packages/shared/components/blocks/input/ChoiceInput/ChoiceInput.ts
//
// Single-select (radio button) input. Value is stored as a string.
// For multi-select (checkboxes), use CheckboxInput instead.
//
import { z } from 'zod';
import { core, input, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { getChoices } from './choiceHelpers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const ChoiceInput = core({
  ...parsers.blocks(),
  name: 'ChoiceInput',
  ...input({ valueSchema: z.string() }),
  // Clicking a radio is a deliberate answer — immediate-mode grading shows
  // incorrect right away instead of softening to incomplete.
  commitOnChange: true,
  description: 'Single-select (radio button) input collecting student selection from Key/Distractor options. Value is a string.',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => fieldSelector(state, props, fields.value, { fallback: '' }),
  },
  attributes: z.object({
    target: z_stateRefList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }).strict(),
  locals: {
    getChoices
  }
});

export default ChoiceInput;
