// src/components/blocks/ChoiceInput/ChoiceInput.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _Noop from '@/components/blocks/layout/_Noop';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

export const fields = state.fields(['value']);

/**
 * Get the list of choices (Key/Distractor children) with their metadata.
 * Used by KeyGrader to determine correctness.
 *
 * @returns {Array<{id: string, tag: string, value: string}>}
 */
function getChoices(props, state, id) {
  const ids = inferRelatedNodes(props, {
    selector: n => n.blueprint.name === 'Key' || n.blueprint.name === 'Distractor',
    infer: ['kids'],
    targets: props.target
  });
  const choices = ids.map(cid => {
    const inst = props.idMap?.[cid];
    const choiceValue = inst?.attributes?.value ?? cid;
    return { id: cid, tag: inst?.tag, value: choiceValue };
  });
  return choices;
}

const ChoiceInput = core({
  ...parsers.blocks(),
  name: 'ChoiceInput',
  description: 'Multiple choice input collecting student selections from Key/Distractor options',
  component: _Noop,
  fields,
  getValue: (props, state, id) => {
    return fieldSelector(state, { ...props, id }, fieldByName('value'), { fallback: '' });
  },
  locals: {
    getChoices
  }
});

export default ChoiceInput;
