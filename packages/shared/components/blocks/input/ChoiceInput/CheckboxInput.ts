// src/components/blocks/ChoiceInput/CheckboxInput.ts
//
// Multi-select checkbox input. Value is stored as an array of selected values.
// For single-select (radio buttons), use ChoiceInput instead.
//
import { z } from 'zod';
import { core, getBlockByOLXId, z_reduxStateKeyList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

/**
 * Get the list of choices (Key/Distractor children) with their metadata.
 * Used by CheckboxGrader to determine correctness.
 *
 * @returns {Array<{id: string, tag: string, value: string}>}
 */
function getChoices(props: RuntimeProps, state, id) {
  const ids = inferRelatedNodes(props, {
    selector: n => n.loBlock.name === 'Key' || n.loBlock.name === 'Distractor',
    infer: ['kids'],
    targets: props.target
  });
  const choices = ids.map(cid => {
    const inst = getBlockByOLXId(props, cid);
    if (!inst) return null;
    const choiceValue = inst.attributes.value ?? cid;
    return { id: cid, tag: inst.tag, value: choiceValue };
  }).filter(Boolean);
  return choices;
}

const CheckboxInput = core({
  ...parsers.blocks(),
  name: 'CheckboxInput',
  isInput: true,
  description: 'Multi-select checkbox input collecting student selections from Key/Distractor options. Value is an array.',
  component: _Noop,
  fields,
  selectValue: (props: RuntimeProps, state, _reduxKey) => {
    const value = fieldSelector(state, props, fields.value, { fallback: [] });
    // Ensure array even if stored value was a string (migration case)
    if (!Array.isArray(value)) {
      return value ? [value] : [];
    }
    return value;
  },
  attributes: baseAttributes.extend({
    target: z_reduxStateKeyList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }),
  locals: {
    getChoices
  }
});

export default CheckboxInput;
