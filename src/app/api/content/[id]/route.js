// src/app/api/content/[id]/route.js
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getEditPathFromProvenance } from '@/lib/lofs/contentPaths';
import { getBestLocaleServer } from '@/lib/i18n/getBestLocale';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

// Block fetching mode for testing async loading:
//   'all'         - return full idMap (fast, sends everything)
//   'single'      - return only requested block (stress-tests async, one-at-a-time)
//   'static-kids' - return block + its static children (practical middle ground)
//
// 'static-kids' is the recommended mode: it serves blocks that need their
// children loaded together (ChoiceInput+Key, graders, etc.) while still
// testing async loading for dynamic references.
const SINGLE_BLOCK_MODE = 'static-kids';

/**
 * Recursively collect a block and all its static children.
 * Uses each component's staticKids() method to determine children.
 */
function collectBlockWithKids(idMap, id, request, collected = {}) {
  if (!id || collected[id] || !idMap[id]) return collected;

  const langMap = idMap[id];
  // langMap is nested structure { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
  const availableLocales = Object.keys(langMap);
  const bestLocale = getBestLocaleServer(request, availableLocales);
  if (!bestLocale) return collected;  // No valid locale for this block
  const entry = langMap[bestLocale];
  if (!entry) return collected;

  collected[id] = langMap;  // Store the nested structure

  const comp = BLOCK_REGISTRY[entry.tag];
  if (comp?.staticKids) {
    for (const childId of comp.staticKids(entry)) {
      collectBlockWithKids(idMap, childId, request, collected);
    }
  }

  return collected;
}

/**
 * Add editPath and editError to nested entry based on its provenance.
 * editPath is the content-relative path for editing.
 * editError explains why editing isn't available (if applicable).
 */
function addEditInfo(langMap, request) {
  // langMap is nested structure { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
  const availableLocales = Object.keys(langMap);
  const bestLocale = getBestLocaleServer(request, availableLocales);
  if (!bestLocale) return langMap;  // No valid locale for this block
  const entry = langMap[bestLocale];
  if (!entry) return langMap;

  const result = getEditPathFromProvenance(entry.provenance);
  const editedEntry = result.valid
    ? { ...entry, editPath: result.relativePath }
    : { ...entry, editPath: null, editError: result.error };

  // Return nested structure with edited entry updated
  return { ...langMap, [bestLocale]: editedEntry };
}

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const { idMap } = await syncContentFromStorage();

    if (id === 'all') {
      return Response.json({
        ok: true,
        idMap
      });
    }

    // TODO: Break out into /api/content/by-id/[id]/
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
        // Practical mode: return block + static children
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
  } catch (error) {
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
