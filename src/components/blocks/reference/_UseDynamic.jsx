// src/components/blocks/_UseDynamic.jsx
import React from 'react';
import { render } from '@/lib/render';
import { useReduxState } from '@/lib/state';

export function _UseDynamic( props ) {
  const { fields, target } = props;
  const [value, inputProps] = useReduxState(props, fields.value, target);

  if (!value) {
    return <pre className="text-red-500">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return render({ ...props, node: value });
}
