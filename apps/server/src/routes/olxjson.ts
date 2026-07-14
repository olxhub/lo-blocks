// apps/server/src/routes/olxjson.ts
//
// GET /api/olxjson?id=X — parsed OLX content, plus the caller's field
// state for the served blocks (their live connections subscribe as a
// side effect — the content fetch IS the subscription). Thin route:
// the state logic lives in @/lib/state/sync/contentState.

import crypto from 'node:crypto';
import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { contentGeneration } from '@/lib/content/generation';
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

      // ETag = the REPRESENTATION, not just the content: the body varies by
      // locale (selectContent) and embeds the caller's initial fieldState, so
      // a generation-only validator would let a locale switch — or a different
      // user on the same browser — 304 into the previous representation's
      // cached body. Key all three; Vary + private keep shared caches honest.
      // (fieldState is the initial snapshot only — live updates ride the
      // websocket — so a same-user, same-locale 304 reusing a cached body is
      // safe; the subscription side effect still runs before short-circuit.)
      const locale = c.req.header('accept-language') ?? '';
      const who: AuthUser | undefined = (c.env as any).incoming?.__user;
      const rep = crypto.createHash('sha256')
        .update(`${locale}\0${who?.safe_user_id ?? ''}`).digest('hex').slice(0, 12);
      const etag = `W/"olx-${contentGeneration()}-${rep}"`;
      const ifNoneMatch = c.req.header('if-none-match');
      c.header('ETag', etag);
      c.header('Vary', 'Accept-Language');
      c.header('Cache-Control', 'private, no-cache');

      if (id === 'all') {
        // 'all' serves the raw index (debug/tooling) — no locale slice, no
        // fieldState, and no per-block subscription (there is no block set to
        // subscribe to). The subscription-before-304 rule below applies to
        // the per-id path only.
        if (ifNoneMatch === etag) return c.body(null, 304);
        return c.json({ ok: true, idMap, errors });
      }
      if (!idMap[id]) {
        return c.json({ ok: false, error: `No content found for ID: ${id}` }, 404);
      }

      const responseIdMap = selectContent(idMap, id, locale || null);
      // User resolved by the session middleware (server.ts stashes it on
      // the raw Node request).
      const user = who;
      // Establish the subscription (the fetch IS the subscription) BEFORE the
      // per-id 304 short-circuit, so a revalidating client still gets its live
      // connections subscribed. (The 'all' branch above is exempt — see there.)
      const fieldState = user
        ? await stateForContentFetch(stateRegistry, subscriptions, user.safe_user_id, responseIdMap)
        : null;
      if (ifNoneMatch === etag) return c.body(null, 304);
      return c.json({ ok: true, idMap: responseIdMap, ...(fieldState ? { fieldState } : {}) });
    } catch (error: any) {
      console.error('Error loading content:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
