// src/lib/content/fetchOlxJson.ts
//
// Centralized content fetching. All client-side content requests go through
// here so there is a single place to swap the transport (e.g. for static
// export builds that serve pre-rendered JSON instead of hitting API routes).
//

import type { OlxKey, IdMap } from '@/lib/types';

const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

// Cache the full content map for static builds so we only fetch it once.
let cachedAllContent: Promise<{ ok: boolean; idMap: IdMap }> | null = null;

function fetchStaticAllContent(): Promise<{ ok: boolean; idMap: IdMap }> {
  if (!cachedAllContent) {
    cachedAllContent = globalThis.fetch('/static-content/all.json').then(r => r.json());
  }
  return cachedAllContent;
}

/**
 * Fetch content by ID.
 *
 * Returns the same { ok, idMap, error? } shape as /api/olxjson/[id].
 * Options (e.g. headers) are passed through to fetch.
 *
 * In static builds, extracts the requested ID from the cached full content map.
 */
export async function fetchOlxJson(
  id: OlxKey,
  options?: RequestInit
): Promise<{ ok: boolean; idMap: IdMap; error?: string }> {
  if (IS_STATIC) {
    const all = await fetchStaticAllContent();
    if (!all.idMap[id]) return { ok: false, idMap: {} as IdMap, error: `Not found: ${id}` };
    // Return the full idMap — child blocks reference siblings by ID
    return { ok: true, idMap: all.idMap };
  }
  const res = await globalThis.fetch(`/api/content/${id}`, options);
  if (!res.ok) return { ok: false, idMap: {}, error: `HTTP ${res.status}` };
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
  if (IS_STATIC) {
    return fetchStaticAllContent();
  }
  const res = await globalThis.fetch('/api/content/all', options);
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
  if (IS_STATIC) {
    const res = await globalThis.fetch('/static-content/activities.json');
    return res.json();
  }
  const res = await globalThis.fetch('/api/activities', options);
  return res.json();
}
