// src/lib/content/fetchOlxJson.ts
//
// Centralized content fetching. All client-side content requests go through
// here so there is a single place to swap the transport (e.g. for static
// export builds that serve pre-rendered JSON instead of hitting API routes).
//

import type { OlxKey, IdMap } from '@/lib/types';

/**
 * Fetch content by ID.
 *
 * Returns the same { ok, idMap, error? } shape as /api/content/[id].
 * Options (e.g. headers) are passed through to fetch.
 */
export async function fetchOlxJson(
  id: OlxKey,
  options?: RequestInit
): Promise<{ ok: boolean; idMap: IdMap; error?: string }> {
  const res = await globalThis.fetch(`/api/content/${id}`, options);
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
