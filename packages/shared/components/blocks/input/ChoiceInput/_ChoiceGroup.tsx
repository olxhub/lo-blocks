// packages/shared/components/blocks/input/ChoiceInput/_ChoiceGroup.tsx
//
// The component for ChoiceInput (radio) and CheckboxInput (checkbox). Both
// inputs are otherwise "noop" containers — they render their kids and hold no
// UI of their own; the interactive pieces are the Key/Distractor items inside.
//
// This component does exactly what _Noop did (render the kids) plus one thing:
// it wraps them in a ChoiceGroupContext.Provider carrying this input's
// identity, so each choice item can read its parent directly instead of
// searching the rendered DOM for it.
//
// Why a context: a choice item needs two facts from its parent input — the
// input's StateKey (which scopes the stored value and names the radio group)
// and whether the input is single- or multi-select. It used to DISCOVER these
// by walking its own rendered ancestors (inferRelatedNodes(infer:['parents'])).
// That discovery is fragile: it depends on the dynamic (rendered) DOM being
// threaded intact from whatever entry rendered the tree. Passing identity
// DOWN from the parent removes the search entirely — the parent always knows
// who it is.
//
'use client';
import React, { createContext } from 'react';
import { useKids } from '@/lib/player/client/render';
import type { RuntimeProps, StateKey } from '@/lib/types';

export interface ChoiceGroupInfo {
  /** The parent input's StateKey. Scopes the value field the item reads and
   *  writes, and is the radio group `name` that binds sibling radios. */
  parentStateKey: StateKey;
  /** Radio (ChoiceInput) vs. checkbox (CheckboxInput): single- vs.
   *  multi-select. Decided by which input provides this context — no more
   *  two-pass ancestor sniffing to tell the two apart. */
  isCheckbox: boolean;
}

// null when a Key/Distractor is rendered outside any choice input; the item
// renders a DisplayError in that case rather than guessing.
export const ChoiceGroupContext = createContext<ChoiceGroupInfo | null>(null);

export default function ChoiceGroup(props: RuntimeProps) {
  const { kids } = useKids(props);

  const group: ChoiceGroupInfo = {
    // nodeInfo.stateKey is this input's own scoped StateKey (assigned by
    // render() — the same key inferRelatedNodes used to return for the parent).
    parentStateKey: props.nodeInfo.stateKey,
    // isCheckbox is decided HERE, from this input's own block name — the one
    // place that unambiguously knows which input this is.
    isCheckbox: props.loBlock.name === 'CheckboxInput',
  };

  return (
    <ChoiceGroupContext.Provider value={group}>
      {kids}
    </ChoiceGroupContext.Provider>
  );
}
