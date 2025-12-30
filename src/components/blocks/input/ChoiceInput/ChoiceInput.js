// src/components/blocks/ChoiceInput/ChoiceInput.js
//
// Single-select (radio button) input. Value is stored as a string.
// For multi-select (checkboxes), use CheckboxInput instead.
//
// ==========================================================================
// ASYNC TODO (idMap refactor)
// ==========================================================================
// This file accesses props.idMap synchronously in getChoices() and locals.
// With SINGLE_BLOCK_MODE, Key/Distractor children may not be loaded yet.
//
// Current workaround: SINGLE_BLOCK_MODE='static-kids' serves parent + children
// together, so this works. Full fix requires making locals/getChoices async
// or pre-loading children in the component via useBlocksByOLXIds.
//
// Same issue affects: CheckboxInput.js, KeyGrader.js, CheckboxGrader.js,
// RulesGrader.js, Ref.js
// ==========================================================================
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

export const fields = state.fields(['value']);

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
function getChoices(props, state, id) {
  let ids = [];

  // Try to get IDs from kids prop first (works without matching nodeInfo, such as from MarkupProblem)
  if (Array.isArray(props.kids)) {
    ids = props.kids
      .filter(k => k?.type === 'block' && k?.id)
      .map(k => k.id)
      .filter(cid => {
        const inst = props.idMap[cid];
        return inst && (inst.tag === 'Key' || inst.tag === 'Distractor');
      });
  }

  // Fall back to inferRelatedNodes if searching kids directly didn't work (such as targets or nested hierarchies)
  if (ids.length === 0 && props.nodeInfo) {
    ids = inferRelatedNodes(props, {
      selector: n => n.blueprint.name === 'Key' || n.blueprint.name === 'Distractor',
      infer: ['kids'],
      targets: props.target
    });
  }

  const choices = ids.map(cid => {
    const inst = props.idMap[cid];
    const choiceValue = inst.attributes.value ?? cid;
    return { id: cid, tag: inst.tag, value: choiceValue };
  });
  return choices;
}

const ChoiceInput = core({
  ...parsers.blocks(),
  name: 'ChoiceInput',
  description: 'Single-select (radio button) input collecting student selection from Key/Distractor options. Value is a string.',
  component: _Noop,
  fields,
  getValue: (props, state, id) => {
    return fieldSelector(state, { ...props, id }, fieldByName('value'), { fallback: '' });
  },
  attributes: baseAttributes.extend({
    target: z.string().optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
  }),
  locals: {
    getChoices
  }
});

export default ChoiceInput;
