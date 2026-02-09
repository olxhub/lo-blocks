/**
 * Centralized API fetch utilities with automatic metadata (locale, auth, headers, etc.)
 *
 * Two patterns:
 * - Client-side: api.fetch(props, path, options) - extracts locale from props.runtime
 * - Server-side: api.apiFetch(url, locale, options) - explicit locale parameter
 *
 * Both add Accept-Language header for content negotiation.
 */

import type { RuntimeProps } from '@/lib/types';

/**
 * Client-side fetch: automatically injects locale from props
 *
 * @param props - RuntimeProps with runtime.locale.code
 * @param path - URL path to fetch
 * @param options - Fetch options (headers will be merged)
 * @returns Promise<Response>
 *
 * Usage:
 *   import * as api from '@/lib/api';
 *   const response = await api.fetch(props, '/api/content/123');
 *   const data = await response.json();
 */
export async function fetch(
  props: RuntimeProps,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const locale = props.runtime.locale.code;

  return globalThis.fetch(path, {
    ...options,
    headers: {
      'Accept-Language': locale,
      ...options.headers,
    },
  });
}

/**
 * Server-side fetch: explicit locale parameter for server code
 *
 * @param url - URL to fetch
 * @param locale - BCP 47 locale code (e.g., 'en-Latn-US')
 * @param options - Fetch options (headers will be merged)
 * @returns Promise<Response>
 *
 * Usage (server-side):
 *   import * as api from '@/lib/api';
 *   const response = await api.apiFetch('/api/content/123', 'en-Latn-US');
 *   const data = await response.json();
 */
export async function apiFetch(
  url: string,
  locale: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!locale) {
    throw new Error('api.apiFetch: locale is required');
  }

  return globalThis.fetch(url, {
    ...options,
    headers: {
      'Accept-Language': locale,
      ...options.headers,
    },
  });
}
