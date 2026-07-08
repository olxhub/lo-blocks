// apps/server/src/routes/olxjson.ts
//
// GET /api/olxjson?id=X — parsed OLX content, plus the caller's field
// state for the served blocks (their live connections subscribe as a
// side effect — the content fetch IS the subscription). Thin route:
// the state logic lives in @/lib/state/sync/contentState.

import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import { stateForContentFetch } from '@/lib/state/sync/contentState';
import type { UserStateRegistry } from '@/lib/state/sync/registry';
import type { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import type { AuthUser } from '../auth.js';

// How much of the idMap a single-block request returns:
//   'single'      → just the requested block
//   'static-kids' → the block plus its statically-reachable kids
//   'all'         → the entire idMap
const SINGLE_BLOCK_MODE: string = 'static-kids';

/** Cut the requested slice of content (see SINGLE_BLOCK_MODE above). */
function selectContent(
  idMap: Record<string, any>,
  id: string,
  acceptLanguage: string | null,
): Record<string, any> {
  switch (SINGLE_BLOCK_MODE) {
    case 'single':
      return { [id]: idMap[id] };
    case 'static-kids':
      return collectBlockWithKids(idMap, parseDefinitionKey(id), acceptLanguage);
    case 'all':
      return idMap;
    default:
      throw new Error(`Unknown SINGLE_BLOCK_MODE: ${SINGLE_BLOCK_MODE}`);
  }
}

export function createOlxJsonHandler(
  stateRegistry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
) {
  return async function handleOlxJson(c: Context): Promise<Response> {
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

      const responseIdMap = selectContent(idMap, id, c.req.header('accept-language') ?? null);
      // User resolved by the session middleware (server.ts stashes it on
      // the raw Node request).
      const user: AuthUser | undefined = (c.env as any).incoming?.__user;
      const fieldState = user
        ? await stateForContentFetch(stateRegistry, subscriptions, user.safe_user_id, responseIdMap)
        : null;
      return c.json({ ok: true, idMap: responseIdMap, ...(fieldState ? { fieldState } : {}) });
    } catch (error: any) {
      console.error('Error loading content:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
