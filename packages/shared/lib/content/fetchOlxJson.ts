// packages/shared/lib/content/fetchOlxJson.ts
//
// Centralized content fetching. All client-side content requests go through
// here so there is a single place to swap the transport (e.g. for static
// export builds that serve pre-rendered JSON instead of hitting API routes).
//

import type { DefinitionKey, IdMap } from '@/lib/types';
import type { StateKey } from '@/lib/types/id-grammar';

/**
 * Fetch content by ID.
 *
 * Returns the same { ok, idMap, fieldState?, error? } shape as
 * /api/olxjson?id=... — fieldState is the caller's saved state for the
 * returned blocks (fields-design step 2b), present only when the user
 * has any. Options (e.g. headers) are passed through to fetch.
 */
export async function fetchOlxJson(
  id: DefinitionKey,
  options?: RequestInit
): Promise<{ ok: boolean; idMap: IdMap; fieldState?: Record<string, any>; error?: string }> {
  const res = await globalThis.fetch(`/api/olxjson?id=${encodeURIComponent(id)}`, options);
  if (!res.ok) return { ok: false, idMap: {}, error: `HTTP ${res.status}` };
  return res.json();
}

/**
 * Fetch field state for EXACT StateKeys — the state lane of the ensure
 * pipeline, for dynamic instances whose state cannot ride a content
 * response (only an ancestor's own state enumerates them).
 *
 * Returns /api/fieldstate's shape: every requested key is covered —
 * present in fieldState.component / .sharedComponent, or listed in
 * `absent` ("confirmed: no state"). The caller treats BOTH as resolved.
 */
export async function fetchFieldState(
  keys: StateKey[],
  options?: RequestInit
): Promise<{
  ok: boolean;
  fieldState?: { component: Record<string, any>; sharedComponent: Record<string, any> };
  absent?: StateKey[];
  error?: string;
}> {
  const query = keys.map((key) => `key=${encodeURIComponent(key)}`).join('&');
  const res = await globalThis.fetch(`/api/fieldstate?${query}`, options);
  if (!res.ok) {
    // The body may carry a structured error (e.g. which keys were
    // invalid); surface its message over the bare status code.
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
  }
  return res.json();
}

/**
 * Fetch the complete idMap (all blocks, all variants).
 *
 * LEGACY: Used by studio for ID search/autocomplete. This dumps the entire
 * content tree and should eventually be replaced by a lighter endpoint
 * (e.g. /api/ids or lazy loading in studio).
 */
export async function fetchAllOlxJson(
  options?: RequestInit
): Promise<{ ok: boolean; idMap: IdMap; error?: string }> {
  const res = await globalThis.fetch('/api/olxjson?id=all', options);
  return res.json();
}

/**
 * Fetch activities list.
 *
 * Returns the same { ok, activities } shape as /api/activities.
 */
export async function fetchActivities(
  options?: RequestInit
): Promise<{ ok: boolean; activities?: Record<string, any>; error?: string }> {
  const res = await globalThis.fetch('/api/activities', options);
  return res.json();
}
