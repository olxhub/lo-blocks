// packages/shared/components/blocks/input/ChoiceInput/CheckboxInput.ts
//
// Multi-select checkbox input. Value is stored as an array of selected values.
// For single-select (radio buttons), use ChoiceInput instead.
//
import { z } from 'zod';
import { core, input, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { getChoices } from './choiceHelpers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const CheckboxInput = core({
  ...parsers.blocks(),
  name: 'CheckboxInput',
  ...input({ valueSchema: z.array(z.string()) }),
  description: 'Multi-select checkbox input collecting student selections from Key/Distractor options. Value is an array.',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => {
      const value = fieldSelector(state, props, fields.value, { fallback: [] });
      // Ensure array even if stored value was a string (migration case)
      if (!Array.isArray(value)) {
        return value ? [value] : [];
      }
      return value;
    },
  },
  attributes: z.object({
    target: z_stateRefList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }).strict(),
  locals: {
    getChoices
  }
});

export default CheckboxInput;
