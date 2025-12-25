// src/components/blocks/_UseDynamic.jsx
import React from 'react';
import { render } from '@/lib/render';
import { useReduxState, useValue } from '@/lib/state';

export function _UseDynamic( props ) {
  const { fields, target, targetRef } = props;

  // If targetRef is provided, get the target from another component's value
  // Fall back to target if refValue is null/undefined/empty (e.g., before selection)
  const refValue = useValue(props, targetRef, { fallback: null });
  const effectiveTarget = refValue || target;

  const [value] = useReduxState(props, fields.value, effectiveTarget);

  if (!value) {
    return <pre className="text-red-500">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return render({ ...props, node: value });
}
