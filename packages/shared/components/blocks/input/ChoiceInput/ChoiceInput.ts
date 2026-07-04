// packages/shared/components/blocks/input/ChoiceInput/ChoiceInput.ts
//
// Single-select (radio button) input. Value is stored as a string.
// For multi-select (checkboxes), use CheckboxInput instead.
//
import { z } from 'zod';
import { core, input, getBlockByOLXId, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { isKidArray } from '@/lib/util/kids';
import type { RuntimeProps, DefinitionKey, StateKey, KidEntry } from '@/lib/types';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { qualifyDefinitionRef, leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';

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
  let defIds: DefinitionKey[] = [];

  // Try to get IDs from kids prop first (works without matching nodeInfo, such as from MarkupProblem)
  if (isKidArray(props.kids)) {
    defIds = props.kids
      .filter((k): k is Extract<KidEntry, { type: 'block' }> => k.type === 'block')
      .map(k => qualifyDefinitionRef(k.id, props.runtime.ns))
      .filter(cid => {
        const inst = getBlockByOLXId(props, cid);
        return inst && (inst.tag === 'Key' || inst.tag === 'Distractor');
      });
  }

  // Fall back to inferRelatedNodes if searching kids directly didn't work (such as targets or nested hierarchies)
  if (defIds.length === 0 && props.nodeInfo) {
    const stateKeys: StateKey[] = inferRelatedNodes(props, {
      selector: n => n.loBlock.name === 'Key' || n.loBlock.name === 'Distractor',
      infer: ['kids'],
      targets: props.target
    });
    defIds = stateKeys.map(sk => leafDefinitionKeyFromStateKey(sk));
  }

  const choices = defIds.map(cid => {
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
  ...input({ valueSchema: z.string() }),
  description: 'Single-select (radio button) input collecting student selection from Key/Distractor options. Value is a string.',
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  selectValue: (props: RuntimeProps, state, _stateKey) => {
    return fieldSelector(state, props, fields.value, { fallback: '' });
  },
  attributes: z.object({
    target: z_stateRefList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }).strict(),
  locals: {
    getChoices
  }
});

export default ChoiceInput;
