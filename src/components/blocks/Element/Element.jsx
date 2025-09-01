// src/components/blocks/Element/Element.jsx
// References the value of another field by name
// Used in LLM prompts to include dynamic content

import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import _Element from './_Element';

export const fields = state.fields([]);

const Element = dev({
  ...parsers.text(), // Use text parser to extract the field reference
  name: 'Element',
  description: 'References the value of another field by name',
  component: _Element,
  fields,
  getValue: (props, state, id) => {
    // Get the Element block from idMap to access its text content
    if (!(id in props.idMap)) {
      throw new Error(`Element getValue: Block with id "${id}" not found in idMap`);
    }
    const elementBlock = props.idMap[id];

    // Extract the referenced ID from the kids (text content)
    const referencedId = (typeof elementBlock.kids === 'string' ? elementBlock.kids : String(elementBlock.kids || '')).trim();
    if (!referencedId) {
      throw new Error(`Element getValue: No field ID specified in Element block "${id}". Element content: "${elementBlock.kids}"`);
    }

    // Check if the referenced component exists
    if (!(referencedId in props.idMap)) {
      throw new Error(`Element getValue: Referenced component "${referencedId}" not found in idMap. Element "${id}" references a non-existent component.`);
    }

    // Get the referenced component's value directly from state
    // Note: We use direct field access here to avoid circular dependency with valueSelector
    const valueField = fieldByName('value');
    if (!valueField) {
      throw new Error(`Element getValue: Field 'value' not registered in field system. This indicates a major system error.`);
    }

    return fieldSelector(state, { ...props, id: referencedId }, valueField, { fallback: '' });
  }
});

export default Element;
