// src/components/blocks/Element/_Element.jsx
// References the value of another component by ID
'use client';

import React from 'react';
import { useValue } from '@/lib/state';
import { DisplayError } from '@/lib/util/debug';

function _Element(props) {
  const { visible = false, kids = '' } = props;

  // The kids content contains the ID of the field we want to reference
  const referencedId = (typeof kids === 'string' ? kids : String(kids)).trim();
  
  if (!referencedId) {
    return <DisplayError name="Element" message="No field ID specified" data={{props}} />;
  }

  // Get the value from the referenced component using the new useValue hook
  const fieldValue = useValue(props, referencedId, { fallback: '' });

  if (String(visible) === 'false' || !visible) {
    // Still subscribe to value but render nothing
    return null;
  }

  if( visible ) {
    return <span>{fieldValue}</span>;
  }
}

export default _Element;
