// apps/web/app/api/olxjson/route.ts
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import type { NextRequest } from 'next/server';

// Block fetching mode for testing async loading:
//   'all'         - return full idMap (fast, sends everything)
//   'single'      - return only requested block (stress-tests async, one-at-a-time)
//   'static-kids' - return block + its static children (practical middle ground)
//
// 'static-kids' is the recommended mode: it serves blocks that need their
// children loaded together (ChoiceInput+Key, graders, etc.) while still
// testing async loading for dynamic references.
const SINGLE_BLOCK_MODE: string = 'static-kids';

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
    const acceptLanguage = request.headers.get('accept-language');
    let responseIdMap;
    switch (SINGLE_BLOCK_MODE) {
      case 'single':
        // Stress-test mode: return only the requested block
        responseIdMap = { [id]: idMap[id] };
        break;
      case 'static-kids':
        // Practical mode: return block + static children + targets
        responseIdMap = collectBlockWithKids(idMap, parseDefinitionKey(id), acceptLanguage);
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
