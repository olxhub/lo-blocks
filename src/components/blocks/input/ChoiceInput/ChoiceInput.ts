// src/components/blocks/ChoiceInput/ChoiceInput.ts
//
// Single-select (radio button) input. Value is stored as a string.
// For multi-select (checkboxes), use CheckboxInput instead.
//
import { z } from 'zod';
import { core, getBlockByOLXId } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import type { RuntimeProps, OlxKey, BlueprintKidEntry } from '@/lib/types';
import _Noop from '@/components/blocks/layout/_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { refToOlxKey } from '@/lib/blocks/idResolver';

export const fields = state.fields([commonFields.value]);

/**
 * Get the list of choices (Key/Distractor children) with their metadata.
 * Used by KeyGrader to determine correctness.
 *
 * Works in two modes:
 * 1. From kids prop (block references) - works without matching nodeInfo, such as from MarkupProblem
 * 2. From nodeInfo tree traversal - handles targets or nested hierarchies
 *
 * @returns {Array<{id: string, tag: string, value: string}>}
 */
function getChoices(props: RuntimeProps, state, id) {
  let ids: OlxKey[] = [];

  // Try to get IDs from kids prop first (works without matching nodeInfo, such as from MarkupProblem)
  if (Array.isArray(props.kids)) {
    ids = props.kids
      .filter((k): k is Extract<BlueprintKidEntry, { type: 'block' }> => k.type === 'block')
      .map(k => refToOlxKey(k.id))
      .filter(cid => {
        const inst = getBlockByOLXId(props, cid);
        return inst && (inst.tag === 'Key' || inst.tag === 'Distractor');
      });
  }

  // Fall back to inferRelatedNodes if searching kids directly didn't work (such as targets or nested hierarchies)
  if (ids.length === 0 && props.nodeInfo) {
    ids = inferRelatedNodes(props, {
      selector: n => n.loBlock.name === 'Key' || n.loBlock.name === 'Distractor',
      infer: ['kids'],
      targets: props.target
    });
  }

  const choices = ids.map(cid => {
    const inst = getBlockByOLXId(props, cid);
    if (!inst) return null;
    const choiceValue = inst.attributes.value ?? cid;
    return { id: cid, tag: inst.tag, value: choiceValue };
  }).filter(Boolean);
  return choices;
}

const ChoiceInput = core({
  ...parsers.blocks(),
  name: 'ChoiceInput',
  isInput: true,
  description: 'Single-select (radio button) input collecting student selection from Key/Distractor options. Value is a string.',
  component: _Noop,
  fields,
  getValue: (props: RuntimeProps, state, id) => {
    return fieldSelector(state, { ...props, id }, fields.value, { fallback: '' });
  },
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }),
  locals: {
    getChoices
  }
});

export default ChoiceInput;
