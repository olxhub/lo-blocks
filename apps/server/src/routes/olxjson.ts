// apps/server/src/routes/olxjson.ts
//
// GET /api/olxjson?id=X
//
// Serves parsed OLX content — and the caller's field state for the
// blocks it returns (fields-design step 2b: fetching content declares
// what you are about to render, so the content response carries the
// state those blocks need; useBlock's readiness gate then covers both).

import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import type { AuthUser } from '../auth.js';
import type { UserStateRegistry } from '../userState.js';

// How much of the idMap a single-block request returns:
//   'single'      → just the requested block
//   'static-kids' → the block plus its statically-reachable kids
//   'all'         → the entire idMap
const SINGLE_BLOCK_MODE: string = 'static-kids';

/**
 * Pick the user's component buckets that belong to the ids being served.
 * State keys usually equal block ids; scoped variants extend the id
 * (`{id}#{qualifier}`), so prefix matches are included too. Exported for
 * tests.
 */
export function fieldStateForIds(
  scopes: Record<string, any> | null,
  ids: string[],
): Record<string, any> | null {
  if (!scopes?.component) return null;
  const component: Record<string, any> = {};
  for (const key of Object.keys(scopes.component)) {
    if (ids.some((id) => key === id || key.startsWith(`${id}#`))) {
      component[key] = scopes.component[key];
    }
  }
  return Object.keys(component).length > 0 ? { component } : null;
}

export function createOlxJsonHandler(stateRegistry: UserStateRegistry) {
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

      // The caller's state for these blocks. User resolved by the session
      // middleware (server.ts stashes it on the raw Node request); state
      // read from the live materialization when the user has an open
      // socket, else from the field store. Absent state is normal (new
      // user, new content) — the key is simply omitted.
      let fieldState: Record<string, any> | null = null;
      const user: AuthUser | undefined = (c.env as any).incoming?.__user;
      if (user) {
        fieldState = fieldStateForIds(
          await stateRegistry.read(user.safe_user_id),
          Object.keys(responseIdMap),
        );
      }

      return c.json({ ok: true, idMap: responseIdMap, ...(fieldState ? { fieldState } : {}) });
    } catch (error: any) {
      console.error('Error loading content:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
