// packages/shared/components/blocks/input/ChoiceInput/CheckboxInput.ts
//
// Multi-select checkbox input. Value is stored as an array of selected values.
// For single-select (radio buttons), use ChoiceInput instead.
//
import { z } from 'zod';
import { core, input, getBlockByOLXId, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
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
    const defKey = leafDefinitionKeyFromStateKey(cid);
    const inst = getBlockByOLXId(props, defKey);
    if (!inst) return null;
    const choiceValue = inst.attributes.value ?? defKey;
    return { id: defKey, tag: inst.tag, value: choiceValue };
  }).filter(Boolean);
  return choices;
}

const CheckboxInput = core({
  ...parsers.blocks(),
  name: 'CheckboxInput',
  ...input({ valueSchema: z.array(z.string()) }),
  description: 'Multi-select checkbox input collecting student selections from Key/Distractor options. Value is an array.',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  selectValue: (props: RuntimeProps, state, _stateKey) => {
    const value = fieldSelector(state, props, fields.value, { fallback: [] });
    // Ensure array even if stored value was a string (migration case)
    if (!Array.isArray(value)) {
      return value ? [value] : [];
    }
    return value;
  },
  attributes: z.object({
    target: z_stateRefList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }).strict(),
  locals: {
    getChoices
  }
});

export default CheckboxInput;
