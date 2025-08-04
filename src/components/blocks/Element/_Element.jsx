// src/components/blocks/Element/_Element.jsx
// References the value of another component by ID
'use client';

import React from 'react';
import { useFieldSelector, fieldByName } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

function _Element(props) {
  const { visible = true, kids = '' } = props;

  // The kids content contains the ID of the field we want to reference
  const referencedId = (typeof kids === 'string' ? kids : String(kids)).trim();
  
  if (!referencedId) {
    return <DisplayError name="Element" message="No field ID specified" data={{props}} />;
  }

  // Get the field info for the 'value' field (standard field name for inputs)
  const valueField = fieldByName('value');
  
  if (!valueField) {
    return <DisplayError name="Element" message="Field 'value' not registered in system" data={{referencedId}} />;
  }

  // Get the value from the referenced component's 'value' field
  const fieldValue = useFieldSelector(props, valueField, { 
    id: referencedId, 
    fallback: '' 
  });

  if (String(visible) === 'false') {
    // Still subscribe to value but render nothing
    return null;
  }

  return <span>{fieldValue}</span>;
}

export default _Element;
