// packages/shared/components/blocks/input/ChoiceInput/ChoiceGroupContext.tsx
//
// The identity a ChoiceInput (radio) or CheckboxInput (checkbox) hands down
// to each of its Key/Distractor items.
//
// Why a context: a choice item needs two facts from its parent input — the
// input's StateKey (which scopes the stored value and names the radio group)
// and whether the input is single- or multi-select. It used to DISCOVER these
// by walking its own rendered ancestors (inferRelatedNodes(infer:['parents'])).
// That discovery is fragile: it depends on the dynamic (rendered) DOM being
// threaded intact from whatever entry rendered the tree, so a render entry
// that doesn't wire nodeInfo the way the lesson path does makes the item
// crash. Passing identity DOWN from the parent removes the search entirely —
// the parent always knows who it is. See _ChoiceGroup for the provider.
//
'use client';
import { createContext } from 'react';
import type { StateKey } from '@/lib/types';

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
