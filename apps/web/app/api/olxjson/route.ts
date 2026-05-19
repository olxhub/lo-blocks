// src/app/api/olxjson/route.ts
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getBestVariantServer } from '@/lib/i18n/getBestVariant';
import { variantMapKeys } from '@/lib/types/i18n';
import { parseStateRef, stateKeyForGlobalRef, allDefinitionKeysFromStateKey } from '@/lib/types/id-grammar';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { getRefAttributes } from '@/lib/blocks/attributeSchemas';
import type { NextRequest } from 'next/server';
import type { IdMap, OlxJson } from '@/lib/types';

// Block fetching mode for testing async loading:
//   'all'         - return full idMap (fast, sends everything)
//   'single'      - return only requested block (stress-tests async, one-at-a-time)
//   'static-kids' - return block + its static children (practical middle ground)
//
// 'static-kids' is the recommended mode: it serves blocks that need their
// children loaded together (ChoiceInput+Key, graders, etc.) while still
// testing async loading for dynamic references.
const SINGLE_BLOCK_MODE: string = 'static-kids';

/**
 * Recursively collect a block, its static children, and all ref-typed dependencies.
 *
 * Static children are structural (parent-child in the OLX tree).
 * Ref dependencies are cross-block references discovered from Zod-tagged attributes
 * (target=, source=, dest=, etc.). Both are included so the client gets everything
 * it needs in one response.
 */
function collectBlockWithKids(
  idMap: IdMap,
  id: string,
  request: NextRequest,
  collected: Record<string, any> = {}
): Record<string, any> {
  if (!id || collected[id] || !idMap[id]) return collected;

  const variantMap = idMap[id];
  // variantMap is nested structure { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
  const availableVariants = variantMapKeys(variantMap);
  const bestVariant = getBestVariantServer(request, availableVariants);
  if (!bestVariant) return collected;  // No valid variant for this block
  const entry = variantMap[bestVariant] as OlxJson | undefined;
  if (!entry) return collected;

  collected[id] = variantMap;  // Store the nested structure

  // Recurse into static children (structural kids)
  const comp = BLOCK_REGISTRY[entry.tag];
  if (comp?.staticKids) {
    for (const childId of comp.staticKids(entry)) {
      collectBlockWithKids(idMap, childId, request, collected);
    }
  }

  // Recurse into all ref-typed attributes (target=, source=, dest=, etc.).
  // Uses the same getRefAttributes discovery as the client-side ensureReferencedBlocks,
  // so any attribute tagged with z_stateRef/z_stateRefList/z_blockFieldRef* is included.
  const refAttrs = comp?.attributes ? getRefAttributes(comp.attributes) : [];
  for (const { name, extractRefs } of refAttrs) {
    const refValue = entry.attributes?.[name];
    if (refValue == null) continue;

    const refs = extractRefs(refValue);
    for (const ref of refs) {
      // extractRefs returns Zod-validated values — no prefix stripping needed.
      // If a "/" or "./" ref appears, parseStateRef will throw, surfacing bad data.
      const stateKey = stateKeyForGlobalRef(parseStateRef(ref));
      for (const key of allDefinitionKeysFromStateKey(stateKey)) {
        collectBlockWithKids(idMap, key, request, collected);
      }
    }
  }

  return collected;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';

  try {
    const { idMap, errors } = await syncContentFromStorage();

    if (id === 'all') {
      return Response.json({
        ok: true,
        idMap,
        errors
      });
    }

    if (!id || !idMap[id]) {
      return Response.json(
        {
          ok: false,
          error: `No content found for ID: ${id}`,
        },
        { status: 404 }
      );
    }

    // Return blocks based on SINGLE_BLOCK_MODE setting
    let responseIdMap;
    switch (SINGLE_BLOCK_MODE) {
      case 'single':
        // Stress-test mode: return only the requested block
        responseIdMap = { [id]: idMap[id] };
        break;
      case 'static-kids':
        // Practical mode: return block + static children + targets
        responseIdMap = collectBlockWithKids(idMap, id, request);
        break;
      case 'all':
      default:
        // Full mode: return entire idMap
        responseIdMap = idMap;
        break;
    }

    return Response.json({
      ok: true,
      idMap: responseIdMap
    });
  } catch (error: any) {
    console.error('Error loading content:', error);

    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
