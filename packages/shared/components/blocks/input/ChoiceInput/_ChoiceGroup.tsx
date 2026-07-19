// packages/shared/components/blocks/input/ChoiceInput/_ChoiceGroup.tsx
//
// The component for ChoiceInput (radio) and CheckboxInput (checkbox). Both
// inputs are otherwise "noop" containers — they render their kids and hold no
// UI of their own; the interactive pieces are the Key/Distractor items inside.
//
// This component does exactly what _Noop did (render the kids) plus one thing:
// it wraps them in a ChoiceGroupContext.Provider carrying this input's
// identity, so each choice item can read its parent directly instead of
// searching the rendered DOM for it. isCheckbox is decided HERE, from this
// input's own block name — the one place that unambiguously knows which input
// this is.
//
'use client';
import React from 'react';
import { useKids } from '@/lib/render';
import type { RuntimeProps } from '@/lib/types';
import { ChoiceGroupContext, type ChoiceGroupInfo } from './ChoiceGroupContext';

export default function ChoiceGroup(props: RuntimeProps) {
  const { kids } = useKids(props);

  const group: ChoiceGroupInfo = {
    // nodeInfo.stateKey is this input's own scoped StateKey (assigned by
    // render() — the same key inferRelatedNodes used to return for the parent).
    parentStateKey: props.nodeInfo.stateKey,
    isCheckbox: props.loBlock.name === 'CheckboxInput',
  };

  return (
    <ChoiceGroupContext.Provider value={group}>
      {kids}
    </ChoiceGroupContext.Provider>
  );
}
