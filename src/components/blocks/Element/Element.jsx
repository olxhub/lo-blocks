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
    const elementBlock = idMap?.[id];
    if (!elementBlock) return '';
    
    // Extract the referenced ID from the kids (text content)
    const referencedId = (typeof elementBlock.kids === 'string' ? elementBlock.kids : String(elementBlock.kids || '')).trim();
    if (!referencedId) return '';
    
    // Get the 'value' field info and look up the referenced component's value
    const valueField = fieldByName('value');
    if (!valueField) return '';
    
    return fieldSelector(state, { id: referencedId }, valueField, { fallback: '' });
  }
});

export default Element;
