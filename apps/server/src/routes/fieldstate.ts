// apps/server/src/routes/fieldstate.ts
//
// GET /api/fieldstate?key=X&key=Y — the caller's field state for EXACT
// StateKeys, for state the content response could not have named:
// dynamic instances (`ns/list:#2:grader`) whose existence only an
// ancestor's own state enumerates. The demand-driven complement of
// /api/olxjson's bundled state; like it, fetching IS subscribing.
// Thin route: validation here, state logic in
// @/lib/state/sync/contentState.
//
// Response: { ok, fieldState: { component, sharedComponent }, absent }.
// Every requested key is covered — present in a fieldState map or
// listed in `absent` ("confirmed: no state"), so a loading block always
// gets an answer, never an eternal spinner.

import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { parseStateKey, type StateKey } from '@/lib/types/id-grammar';
import { stateForKeys } from '@/lib/state/sync/contentState';
import type { UserStateRegistry } from '@/lib/state/sync/registry';
import type { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import type { AuthUser } from '../auth.js';

/** A page's worth of dynamic instances is tens of keys; hundreds is a
 * runaway client (or an attempt to turn exact-key reads back into a
 * table scan). */
const MAX_KEYS = 256;

export function createFieldStateHandler(
  stateRegistry: UserStateRegistry,
  subscriptions: SubscriptionRegistry,
) {
  return async function handleFieldState(c: Context): Promise<Response> {
    const raw = c.req.queries('key') ?? [];
    if (raw.length === 0) {
      return c.json({ ok: false, error: 'No keys requested (?key=...)' }, 400);
    }
    if (raw.length > MAX_KEYS) {
      return c.json({ ok: false, error: `Too many keys (${raw.length} > ${MAX_KEYS})` }, 400);
    }

    const keys: StateKey[] = [];
    const invalid: string[] = [];
    for (const k of raw) {
      try { keys.push(parseStateKey(k)); } catch { invalid.push(k); }
    }
    if (invalid.length > 0) {
      return c.json({ ok: false, error: 'Invalid state keys', invalid }, 400);
    }

    // User resolved by the session middleware (server.ts stashes it on
    // the raw Node request). Content is served anonymously; state never.
    const user: AuthUser | undefined = (c.env as any).incoming?.__user;
    if (!user) {
      return c.json({ ok: false, error: 'No authenticated user' }, 401);
    }

    try {
      const { idMap } = await syncContentFromStorage();
      const { component, sharedComponent, absent } = await stateForKeys(
        stateRegistry, subscriptions, user.safe_user_id, keys, idMap);
      return c.json({ ok: true, fieldState: { component, sharedComponent }, absent });
    } catch (error: any) {
      console.error('Error loading field state:', error);
      return c.json({ ok: false, error: error.message ?? 'Unknown error' }, 500);
    }
  };
}
