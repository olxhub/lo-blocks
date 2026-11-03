// Resolve the first rendered, visible copy of a block definition.

import { leafDefinitionKeyFromStateKey, stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { ContentNamespace, StateRef } from '@/lib/types';

export function findVisibleBlock(target: StateRef, ns: ContentNamespace): HTMLElement | null {
  const definitionKey = String(leafDefinitionKeyFromStateKey(stateKeyForGlobalRef(target, ns)));
  // Attribute comparison avoids interpolating authored IDs into a selector,
  // and works in DOM implementations which do not provide CSS.escape.
  const matches = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'))
    .filter(element => element.dataset.blockId === definitionKey);

  return matches.find(element => element.offsetParent !== null) ?? null;
}
