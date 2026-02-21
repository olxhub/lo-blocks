// src/lib/content/fetchContent.ts
//
// Centralized content fetching for both dynamic (API) and static (JSON) modes.
//
// In dynamic mode: proxies to /api/content/{id} and /api/activities
// In static mode:  fetches pre-exported JSON from /static-content/
//

const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

let cachedContent: Promise<{ ok: boolean; idMap: Record<string, any> }> | null = null;

function fetchAllContent() {
  if (!cachedContent) {
    cachedContent = globalThis.fetch('/static-content/all.json').then(res => res.json());
  }
  return cachedContent;
}

/**
 * Fetch content by ID, abstracting over dynamic API vs static JSON.
 *
 * Returns the same { ok, idMap, error? } shape as /api/content/[id].
 * In dynamic mode, options (e.g. headers) are passed through to fetch.
 */
export async function fetchContent(
  id: string,
  options?: RequestInit
): Promise<{ ok: boolean; idMap: Record<string, any>; error?: string }> {
  if (!isStaticExport) {
    const res = await globalThis.fetch(`/api/content/${id}`, options);
    return res.json();
  }

  const allContent = await fetchAllContent();

  if (id === 'all') {
    return { ok: true, idMap: allContent.idMap };
  }

  if (!allContent.idMap[id]) {
    return { ok: false, idMap: {}, error: `No content found for ID: ${id}` };
  }

  // Return full idMap so all references resolve in Redux
  return { ok: true, idMap: allContent.idMap };
}

/**
 * Fetch activities list, abstracting over dynamic API vs static JSON.
 *
 * Returns the same { ok, activities } shape as /api/activities.
 */
export async function fetchActivities(
  options?: RequestInit
): Promise<{ ok: boolean; activities?: Record<string, any>; error?: string }> {
  if (!isStaticExport) {
    const res = await globalThis.fetch('/api/activities', options);
    return res.json();
  }

  const cached = await globalThis.fetch('/static-content/activities.json').then(r => r.json());
  return cached;
}
