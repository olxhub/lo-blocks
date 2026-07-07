// apps/server/src/routes/olxjson.ts
//
// GET /api/olxjson?id=X
//
// Serves parsed OLX content.

import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';
import { parseDefinitionKey } from '@/lib/types/id-grammar';

// How much of the idMap a single-block request returns:
//   'single'      → just the requested block
//   'static-kids' → the block plus its statically-reachable kids
//   'all'         → the entire idMap
const SINGLE_BLOCK_MODE: string = 'static-kids';

export async function handleOlxJson(c: Context): Promise<Response> {
  const id = c.req.query('id');

  if (!id) {
    return c.json({ ok: false, error: 'Missing ID' }, 400);
  }

  try {
    const { idMap, errors } = await syncContentFromStorage();

    if (id === 'all') {
      return c.json({ ok: true, idMap, errors });
    }

    if (!idMap[id]) {
      return c.json({ ok: false, error: `No content found for ID: ${id}` }, 404);
    }

    const acceptLanguage = c.req.header('accept-language') ?? null;
    let responseIdMap;
    switch (SINGLE_BLOCK_MODE) {
      case 'single':
        responseIdMap = { [id]: idMap[id] };
        break;
      case 'static-kids':
        responseIdMap = collectBlockWithKids(idMap, parseDefinitionKey(id), acceptLanguage);
        break;
      case 'all':
      default:
        responseIdMap = idMap;
        break;
    }

    return c.json({ ok: true, idMap: responseIdMap });
  } catch (error: any) {
    console.error('Error loading content:', error);
    return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
  }
}
