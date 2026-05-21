// packages/shared/lib/content/collectBlockWithKids.ts
//
// Recursively collect a block, its static children, and its target= references.
//
// Static children are structural (parent-child in the OLX tree).
// Targets are cross-block references (e.g. Ref → TextArea, Grader → Input).
// Both are included so the client gets everything it needs in one response.

import { getBestVariantFromHeader } from '@/lib/i18n/getBestVariant';
import { variantMapKeys } from '@/lib/types/i18n';
import { parseAnyStateRef, stateKeyForGlobalRef, allDefinitionKeysFromStateKey } from '@/lib/types/id-grammar';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { getRefAttributes } from '@/lib/blocks/attributeSchemas';
import type { IdMap, OlxJson } from '@/lib/types';

export function collectBlockWithKids(
  idMap: IdMap,
  id: string,
  acceptLanguage: string | null,
  collected: Record<string, any> = {}
): Record<string, any> {
  if (!id || collected[id] || !idMap[id]) return collected;

  const variantMap = idMap[id];
  const availableVariants = variantMapKeys(variantMap);
  const bestVariant = getBestVariantFromHeader(acceptLanguage, availableVariants);
  if (!bestVariant) return collected;
  const entry = variantMap[bestVariant] as OlxJson | undefined;
  if (!entry) return collected;

  collected[id] = variantMap;

  // Recurse into static children (structural kids)
  const comp = BLOCK_REGISTRY[entry.tag];
  if (comp?.staticKids) {
    for (const childId of comp.staticKids(entry)) {
      collectBlockWithKids(idMap, childId, acceptLanguage, collected);
    }
  }

  // Recurse into all ref-typed attributes (target=, source=, dest=, etc.).
  const refAttrs = comp?.attributes ? getRefAttributes(comp.attributes) : [];
  for (const { name, extractRefs } of refAttrs) {
    const refValue = entry.attributes?.[name];
    if (refValue == null) continue;

    const refs = extractRefs(refValue);
    for (const ref of refs) {
      const stateKey = stateKeyForGlobalRef(parseAnyStateRef(ref));
      for (const key of allDefinitionKeysFromStateKey(stateKey)) {
        collectBlockWithKids(idMap, key, acceptLanguage, collected);
      }
    }
  }

  return collected;
}
