// apps/client/src/router.ts
//
// Simple pathname-based router. No library needed — just pattern matching.
// Add routes here as they migrate from Next.js.
//
import type { StateKey } from '@/lib/types';
import { asStateKey, validateStateKey } from '@/lib/types/id-grammar';

export type Route =
  | { page: 'preview'; id: StateKey }
  | { page: 'catalog' }
  | { page: 'notFound'; path: string; reason?: string; detail?: string };

export function resolveRoute(pathname: string): Route {
  // /catalog — the author front page (the new `/`, parallel during migration)
  if (pathname === '/catalog') {
    return { page: 'catalog' };
  }

  // /preview/:id
  const previewMatch = pathname.match(/^\/preview\/(.+)$/);
  if (previewMatch) {
    const raw = previewMatch[1];
    // A malformed id is a 404, not a crash: route to notFound with the
    // grammar's explanation rather than throwing out of boot().
    const valid = validateStateKey(raw);
    if (valid !== true) {
      return {
        page: 'notFound',
        path: pathname,
        reason: `This doesn't look like a valid activity address. Check the link and try again.`,
        detail: valid,
      };
    }
    return { page: 'preview', id: asStateKey(raw) };
  }

  return { page: 'notFound', path: pathname };
}
