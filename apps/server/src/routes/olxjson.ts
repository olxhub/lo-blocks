// apps/server/src/routes/olxjson.ts
//
// GET /api/olxjson/:id
//
// Serves parsed OLX content. Same logic as the Next.js API route,
// using the same shared code — no duplication.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';

// See apps/web/app/api/olxjson/[id]/route.ts for mode documentation.
const SINGLE_BLOCK_MODE: string = 'static-kids';

function jsonResponse(res: ServerResponse, status: number, body: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleOlxJson(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  // Extract ID from /api/olxjson/:id
  const id = url.pathname.replace('/api/olxjson/', '');

  if (!id) {
    jsonResponse(res, 400, { ok: false, error: 'Missing ID' });
    return;
  }

  try {
    const { idMap, errors } = await syncContentFromStorage();

    if (id === 'all') {
      jsonResponse(res, 200, { ok: true, idMap, errors });
      return;
    }

    if (!idMap[id]) {
      jsonResponse(res, 404, { ok: false, error: `No content found for ID: ${id}` });
      return;
    }

    const acceptLanguage = req.headers['accept-language'] ?? null;
    let responseIdMap;
    switch (SINGLE_BLOCK_MODE) {
      case 'single':
        responseIdMap = { [id]: idMap[id] };
        break;
      case 'static-kids':
        responseIdMap = collectBlockWithKids(idMap, id, acceptLanguage);
        break;
      case 'all':
      default:
        responseIdMap = idMap;
        break;
    }

    jsonResponse(res, 200, { ok: true, idMap: responseIdMap });
  } catch (error: any) {
    console.error('Error loading content:', error);
    jsonResponse(res, 500, { ok: false, error: error.message ?? 'Unknown error' });
  }
}
