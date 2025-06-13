// src/components/blocks/_UseDynamic.jsx
import React from 'react';
import { render } from '@/lib/render';
import { useReduxInput } from '@/lib/blocks';

export function _UseDynamic( params ) {
  const [value, inputProps] = useReduxInput(params.id, params.fields.value, params.target);

  if (!params.target) {
    return <pre className="text-red-500">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return render({ ...params, node: params.target });
}
