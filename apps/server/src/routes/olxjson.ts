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
import type { UserStateRegistry } from '@/lib/state/sync/registry';
import { SHARED_STATE_ID } from '@/lib/state/sync/registry';
import type { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import { parsePartitionSpec, groupFor, partitionedId } from '@/lib/state/sync/partitions';

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

/**
 * For each served block, the key its shared state lives under: grouped
 * blocks (grouped-by attribute) partition by THIS caller's own state
 * (groups.ts); everything else keys by plain id.
 */
function partitionKeysFor(
  responseIdMap: Record<string, any>,
  callerScopes: Record<string, any> | null,
): Map<string, string> {
  const keyOf = new Map<string, string>();
  for (const id of Object.keys(responseIdMap)) {
    let key = id;
    for (const variant of Object.values(responseIdMap[id] ?? {})) {
      const spec = (variant as any)?.attributes?.['grouped-by'];
      if (spec) {
        const parsed = parsePartitionSpec(spec, id);
        const group = parsed ? groupFor(callerScopes, parsed) : undefined;
        if (group !== undefined) key = partitionedId(id, group);
        break;
      }
    }
    keyOf.set(id, key);
  }
  return keyOf;
}

/**
 * The caller's shared buckets for the served blocks, mapped back to the
 * plain block id (clients are partition-oblivious). Travels under its
 * own response key: per-user buckets adopt only when locally absent, but
 * shared FIELDS are server-authoritative and merge at field granularity
 * regardless of local bucket presence (see ADOPT_FIELD_STATE, store.ts).
 */
function sharedStateFor(
  sharedScopes: Record<string, any> | null,
  keyOf: Map<string, string>,
): Record<string, any> {
  const sharedComponent: Record<string, any> = {};
  for (const [id, key] of keyOf) {
    const bucket = sharedScopes?.component?.[key];
    if (bucket !== undefined) sharedComponent[id] = bucket;
  }
  return sharedComponent;
}

export function createOlxJsonHandler(
  stateRegistry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
) {
  /**
   * Attach the caller's field state to a content response, and subscribe
   * their live sockets to the served blocks — the content fetch IS the
   * subscription (fields-design 2b): fetching a page declares what the
   * caller renders. The user was resolved by the session middleware
   * (server.ts stashes it on the raw Node request); state reads from the
   * live materialization when a socket is open, else the field store.
   * Absent state is normal (new user, new content) — returns null and
   * the response key is simply omitted.
   */
  async function fieldStateAndSubscriptions(
    c: Context,
    responseIdMap: Record<string, any>,
  ): Promise<Record<string, any> | null> {
    const user: AuthUser | undefined = (c.env as any).incoming?.__user;
    if (!user) return null;

    const callerScopes = await stateRegistry.read(user.safe_user_id);
    const keyOf = partitionKeysFor(responseIdMap, callerScopes);

    for (const ws of stateRegistry.socketsOf(user.safe_user_id)) {
      subscriptions.subscribe(ws, [...keyOf.values()]);
    }

    const own = fieldStateForIds(callerScopes, [...keyOf.keys()]);
    const shared = sharedStateFor(await stateRegistry.read(SHARED_STATE_ID), keyOf);
    if (!own && Object.keys(shared).length === 0) return null;
    return {
      ...(own ? { component: own.component } : {}),
      ...(Object.keys(shared).length > 0 ? { sharedComponent: shared } : {}),
    };
  }

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
      const fieldState = await fieldStateAndSubscriptions(c, responseIdMap);
      return c.json({ ok: true, idMap: responseIdMap, ...(fieldState ? { fieldState } : {}) });
    } catch (error: any) {
      console.error('Error loading content:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
