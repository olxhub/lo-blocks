// src/components/blocks/Ref.jsx
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { valueSelector, fieldByName, fieldSelector } from '@/lib/state';
import _Ref from './_Ref';

const Ref = core({
  ...parsers.text(), // Support text content like Element
  name: 'Ref',
  component: _Ref,
  description: 'Reference another component\'s value by ID. Supports both target attribute and text content.',
  getValue: (props, state, id) => {
    // Get the Ref block from idMap to access its attributes and content
    const refNode = props.idMap[id];
    if (!refNode) return '';

    // Target can come from attribute or text content (kids)
    const targetId = refNode.attributes?.target ||
                     (typeof refNode.kids === 'string' ? refNode.kids : String(refNode.kids || '')).trim();

    if (!targetId) return '';

    // Check if a specific field is requested
    const field = refNode.attributes?.field;

    if (field) {
      // Access specific field using fieldSelector
      const fieldInfo = fieldByName(field);
      if (!fieldInfo) return '';
      return fieldSelector(state, { ...props, id: targetId }, fieldInfo, { fallback: '' });
    } else {
      // Use valueSelector to get the target's value (calls getValue if available)
      return valueSelector(props, state, targetId, { fallback: '' });
    }
  }
});

export default Ref;
