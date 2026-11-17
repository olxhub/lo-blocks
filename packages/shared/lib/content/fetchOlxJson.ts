// packages/shared/lib/content/fetchOlxJson.ts
//
// Centralized content fetching. All client-side content requests go through
// here so there is a single place to swap the transport (e.g. for static
// export builds that serve pre-rendered JSON instead of hitting API routes).
//

import type { DefinitionKey, IdMap } from '@/lib/types';

/**
 * Result of a single-block content fetch.
 *
 * `retryable` marks failures that say nothing about the content itself — a
 * dead route, a proxy's HTML error page, a 5xx, a truncated body. The caller
 * (ensureBlock) may re-arm those; a definitive 404 it must not, or a missing
 * block becomes a request storm.
 */
export type OlxJsonFetchResult = {
  ok: boolean;
  idMap: IdMap;
  fieldState?: Record<string, any>;
  error?: string;
  retryable?: boolean;
};

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
): Promise<OlxJsonFetchResult> {
  const res = await globalThis.fetch(`/api/olxjson?id=${encodeURIComponent(id)}`, options);
  if (!res.ok) {
    // Surface the server's own explanation (e.g. "No content found for ID: …")
    // and the id we asked for. A bare "HTTP 404" tells the reader nothing about
    // WHICH block failed or WHY — and for content that should have been supplied
    // locally (inline/parsed), the fetch itself is the surprise worth naming.
    let detail = '';
    try {
      const body: any = await res.json();
      if (body?.error) detail = `: ${body.error}`;
    } catch { /* non-JSON body — the status alone will have to do */ }
    return {
      ok: false,
      idMap: {},
      error: `Content fetch for "${id}" failed — HTTP ${res.status}${detail}`,
      // 4xx is the server's verdict on this id; 5xx is the server having a bad
      // day and may well succeed next time.
      retryable: res.status >= 500,
    };
  }

  // A 200 is NOT proof of JSON. A static/SPA deploy answers an unknown
  // /api/... route with index.html and status 200; a proxy can hand back an
  // HTML error page the same way. Parse defensively and return a normal
  // failure result — a raw SyntaxError escaping here used to leave the caller's
  // 'loading' marker in Redux with nothing to clear it.
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed as OlxJsonFetchResult;
  } catch {
    const contentType = res.headers?.get?.('content-type') || 'unknown';
    return {
      ok: false,
      idMap: {},
      error: `Content fetch for "${id}" returned non-JSON (content-type: ${contentType}) — is the /api/olxjson route served here?`,
      retryable: true,
    };
  }
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
