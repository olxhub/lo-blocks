// src/components/blocks/Element/Element.jsx
// References the value of another field by name
// Used in LLM prompts to include dynamic content

import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldByName, fieldSelector } from '@/lib/state';
import _Element from './_Element';

export const fields = state.fields([]);

const Element = dev({
  ...parsers.text, // Use text parser to extract the field reference
  name: 'Element',
  description: 'References the value of another field by name',
  component: _Element,
  fields,
  getValue: (state, id, _attributes, idMap) => {
    // Get the Element block from idMap to access its text content
    if (!(id in idMap)) {
      throw new Error(`Element getValue: Block with id "${id}" not found in idMap`);
    }
    const elementBlock = idMap[id];

    // Extract the referenced ID from the kids (text content)
    const referencedId = (typeof elementBlock.kids === 'string' ? elementBlock.kids : String(elementBlock.kids || '')).trim();
    if (!referencedId) {
      throw new Error(`Element getValue: No field ID specified in Element block "${id}". Element content: "${elementBlock.kids}"`);
    }

    // Get the 'value' field info and look up the referenced component's value
    const valueField = fieldByName('value');
    if (!valueField) {
      throw new Error(`Element getValue: Field 'value' not registered in field system. This indicates a major system error.`);
    }

    // Check if the referenced component exists
    if (!(referencedId in idMap)) {
      throw new Error(`Element getValue: Referenced component "${referencedId}" not found in idMap. Element "${id}" references a non-existent component.`);
    }

    return state?.[referencedId]?.value ?? '';
  }
});

export default Element;
