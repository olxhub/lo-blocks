// packages/shared/components/blocks/input/ChoiceInput/CheckboxInput.ts
//
// Multi-select checkbox input. Value is stored as an array of selected values.
// For single-select (radio buttons), use ChoiceInput instead.
//
import { z } from 'zod';
import { core, input, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { getChoices } from './choiceHelpers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

// Getters run inside useSelector subscriptions — a fresh [] per call would
// defeat the equality gate and re-render every dispatch while unanswered.
const EMPTY_VALUE: string[] = [];
const EMPTY_CODES: number[] = [];

const CheckboxInput = core({
  ...parsers.blocks(),
  name: 'CheckboxInput',
  ...input({ valueSchema: z.array(z.string()) }),
  description: 'Multi-select checkbox input collecting student selections from Key/Distractor options. Value is an array.',
  // Renders its kids inside a ChoiceGroupContext so each Key/Distractor learns
  // its parent input directly (see _ChoiceGroup) rather than discovering it.
  componentLoader: () => import('./_ChoiceGroup').then(m => m.default),
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => {
      const value = decodedFieldSelector(state, props, fields.value, { fallback: EMPTY_VALUE });
      // Ensure array even if stored value was a string (migration case)
      if (!Array.isArray(value)) {
        return value ? [value] : EMPTY_VALUE;
      }
      return value;
    },
    // The checked options' numeric CODES (survey sense — never scores; see
    // defaultCodes.ts), in the order the learner checked them, matching the
    // order of `value`. Read as `@inputId.codes`; empty when nothing is
    // checked.
    //
    // A checked option with no code and no default is OMITTED rather than
    // represented as a hole, so `sum(@x.codes)` is the sum of what is
    // actually coded. That means `codes` can be shorter than `value` — the
    // documented behaviour, not an oversight.
    codes: (state, props: RuntimeProps, _stateKey) => {
      const value = decodedFieldSelector(state, props, fields.value, { fallback: EMPTY_VALUE });
      const selected: string[] = Array.isArray(value) ? value : (value ? [value as string] : EMPTY_VALUE);
      if (selected.length === 0) return EMPTY_CODES;
      const codeByValue = new Map(getChoices(props, state, undefined).map(c => [c.value, c.code]));
      const codes = selected
        .map(v => codeByValue.get(v))
        .filter((code): code is number => typeof code === 'number');
      return codes.length === 0 ? EMPTY_CODES : codes;
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
