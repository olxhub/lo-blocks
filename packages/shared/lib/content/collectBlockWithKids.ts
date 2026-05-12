// packages/shared/lib/content/collectBlockWithKids.ts
//
// Recursively collect a block, its static children, and its target= references.
//
// Static children are structural (parent-child in the OLX tree).
// Targets are cross-block references (e.g. Ref → TextArea, Grader → Input).
// Both are included so the client gets everything it needs in one response.

import { pickBestVariant } from '@/lib/i18n/getBestVariant';
import { allOlxKeys } from '@/lib/blocks/idResolver';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { IdMap, OlxJson, ReduxStateKey } from '@/lib/types';

export function collectBlockWithKids(
  idMap: IdMap,
  id: string,
  acceptLanguage: string | null,
  collected: Record<string, any> = {}
): Record<string, any> {
  if (!id || collected[id] || !idMap[id]) return collected;

  const variantMap = idMap[id];
  // variantMap is nested structure { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
  const availableVariants = Object.keys(variantMap);
  const bestVariant = pickBestVariant(acceptLanguage, availableVariants);
  if (!bestVariant) return collected;  // No valid variant for this block
  const entry = variantMap[bestVariant] as OlxJson | undefined;
  if (!entry) return collected;

  collected[id] = variantMap;  // Store the nested structure

  // Recurse into static children (structural kids)
  const comp = BLOCK_REGISTRY[entry.tag];
  if (comp?.staticKids) {
    for (const childId of comp.staticKids(entry)) {
      collectBlockWithKids(idMap, childId, acceptLanguage, collected);
    }
  }

  // Recurse into target= references (cross-block dependencies).
  // target= is a ReduxStateKey — may contain scope markers (#0) and
  // multiple OlxKey segments (myList:#0:answer). allOlxKeys extracts
  // just the loadable block IDs.
  //
  // TODO: Validate target= values. Invalid targets should eventually
  // surface as DisplayErrors to the author. Open design question: what
  // to validate where. OlxKey segments (the block IDs) could be checked
  // here or at parse time, but scoped ReduxStateKeys (e.g. foo:#0:bar)
  // can't be fully validated statically — scope markers are runtime
  // constructs (DynamicList instance count, etc.). This is one possible
  // validation site; parse-time and client-side contexts (Studio,
  // Markdown editor) are others. See docs/loading-state-todo.md.
  const target = entry.attributes?.target;
  if (typeof target === 'string') {
    const parts = target.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      for (const key of allOlxKeys(part as ReduxStateKey)) {
        collectBlockWithKids(idMap, key, acceptLanguage, collected);
      }
    }
  }

  return collected;
}
