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
import React, { createContext, useId } from 'react';
import { useKids } from '@/lib/player/client/render';
import type { RuntimeProps, StateKey } from '@/lib/types';

export interface ChoiceGroupInfo {
  /** The parent input's StateKey. Scopes the value field the item reads and
   *  writes. State identity only — NOT the DOM radio name (see inputName). */
  parentStateKey: StateKey;
  /** The `name` attribute shared by this group's radios. Unique per MOUNTED
   *  COPY of the input, not per block.
   *
   *  Radio `name` is a document-wide grouping key in HTML. The same block can
   *  be on screen twice — a <Use> reference, or a Tabs panel that stays
   *  mounted (display:none) while inactive. With a block-derived name, both
   *  copies' radios land in ONE browser group; React marks the selection
   *  checked in every copy, the browser enforces one-checked-per-name and the
   *  later (hidden) copy wins, so the VISIBLE radio silently unchecks itself
   *  moments after the click. State stays correct; the learner sees their
   *  answer disappear.
   *
   *  So the DOM name comes from the group's useId() — stable across
   *  re-renders, distinct per mounted copy — while parentStateKey keeps state
   *  shared. Items must use this, never parentStateKey, for `name`. */
  inputName: string;
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

  // Per-mounted-copy DOM scope for the radio group name. See inputName above.
  const domScope = useId();

  const group: ChoiceGroupInfo = {
    // nodeInfo.stateKey is this input's own scoped StateKey (assigned by
    // render() — the same key inferRelatedNodes used to return for the parent).
    parentStateKey: props.nodeInfo.stateKey,
    // The StateKey is kept in the name for debuggability; the useId prefix is
    // what actually makes it unique per copy.
    inputName: `${domScope}${props.nodeInfo.stateKey}`,
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
