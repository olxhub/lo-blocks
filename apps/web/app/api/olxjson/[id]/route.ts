// src/app/api/olxjson/[id]/route.ts
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getBestVariantServer } from '@/lib/i18n/getBestVariant';
import { allOlxKeys } from '@/lib/blocks/idResolver';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { NextRequest } from 'next/server';
import type { IdMap, OlxJson, ReduxStateKey } from '@/lib/types';

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
 * Recursively collect a block, its static children, and its target= references.
 *
 * Static children are structural (parent-child in the OLX tree).
 * Targets are cross-block references (e.g. Ref → TextArea, Grader → Input).
 * Both are included so the client gets everything it needs in one response.
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
  const availableVariants = Object.keys(variantMap);
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
        collectBlockWithKids(idMap, key, request, collected);
      }
    }
  }

  return collected;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { idMap, errors } = await syncContentFromStorage();

    if (id === 'all') {
      return Response.json({
        ok: true,
        idMap,
        errors
      });
    }

    // TODO: Break out into /api/olxjson/by-id/[id]/
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
