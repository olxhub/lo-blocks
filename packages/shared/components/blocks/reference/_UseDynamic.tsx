// packages/shared/components/blocks/reference/_UseDynamic.tsx
import React from 'react';
import { useRenderedBlock } from '@/lib/render';
import { useFieldState, useValue } from '@/lib/state';
import type { RuntimeProps, StateRef } from '@/lib/types';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';

function DynamicContent({ props, value }: { props: RuntimeProps; value: StateRef }) {
  const stateKey = stateKeyForGlobalRef(value, props.runtime.ns);
  const { block } = useRenderedBlock(props, stateKey);
  return <>{block}</>;
}

export default function UseDynamic( props: RuntimeProps ) {
  const { fields, target, targetRef } = props;

  // If targetRef is provided, get the target from another component's value
  // Fall back to target if refValue is null/undefined/empty (e.g., before selection)
  const { value: refValue } = useValue(props, { target: targetRef, fallback: null });
  const effectiveTarget = refValue || target;

  const [value] = useFieldState(props, fields.value, effectiveTarget);

  if (!value) {
    return <pre className="text-error">[Missing &lt;Use&gt; resolution]</pre>;
  }

  return <DynamicContent props={props} value={value} />;
}
