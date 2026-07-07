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
import { SHARED_STATE_ID } from '../userState.js';
import type { SubscriptionRegistry } from '../subscriptions.js';
import { parsePartitionSpec, groupFor, partitionedId } from '../groups.js';

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
        const ids = Object.keys(responseIdMap);
        const ownScopes = await stateRegistry.read(user.safe_user_id);
        // Grouped blocks (grouped-by attribute): resolve THIS caller's
        // partition from their own state, and use the partitioned key for
        // subscription and for the shared bucket served below. Ungrouped
        // ids use the plain id.
        const keyOf = new Map<string, string>();
        for (const id of ids) {
          let key = id;
          for (const variant of Object.values(responseIdMap[id] ?? {})) {
            const spec = (variant as any)?.attributes?.['grouped-by'];
            if (spec) {
              const parsed = parsePartitionSpec(spec, id);
              const group = parsed ? groupFor(ownScopes, parsed) : undefined;
              if (group !== undefined) key = partitionedId(id, group);
              break;
            }
          }
          keyOf.set(id, key);
        }
        // The content fetch IS the subscription (fields-design 2b):
        // fetching a page declares what the caller renders, so their live
        // connections now hear shared/server events for these blocks —
        // scoped to their partition for grouped blocks.
        const keys = [...keyOf.values()];
        for (const ws of stateRegistry.socketsOf(user.safe_user_id)) {
          subscriptions.subscribe(ws, keys);
        }
        const own = fieldStateForIds(ownScopes, ids);
        // Shared buckets (authority: 'shared'/'server' fields) travel
        // under their own key: the client adopts per-user buckets only
        // when locally absent, but shared FIELDS are server-authoritative
        // and merge at field granularity regardless of local bucket
        // presence. Grouped buckets serve the caller's partition, mapped
        // back to the plain id (clients are partition-oblivious).
        const sharedScopes = await stateRegistry.read(SHARED_STATE_ID);
        const sharedComponent: Record<string, any> = {};
        for (const id of ids) {
          const bucket = sharedScopes?.component?.[keyOf.get(id)!];
          if (bucket !== undefined) sharedComponent[id] = bucket;
        }
        if (own || Object.keys(sharedComponent).length > 0) {
          fieldState = {
            ...(own ? { component: own.component } : {}),
            ...(Object.keys(sharedComponent).length > 0 ? { sharedComponent } : {}),
          };
        }
      }

      return c.json({ ok: true, idMap: responseIdMap, ...(fieldState ? { fieldState } : {}) });
    } catch (error: any) {
      console.error('Error loading content:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
