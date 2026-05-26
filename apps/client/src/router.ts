// apps/client/src/router.ts
//
// Simple pathname-based router. No library needed — just pattern matching.
// Add routes here as they migrate from Next.js.
//
import type { StateKey } from '@/lib/types';
import { parseStateKey } from '@/lib/types/id-grammar';

export type Route =
  | { page: 'preview'; id: StateKey }
  | { page: 'notFound'; path: string };

export function resolveRoute(pathname: string): Route {
  // /preview/:id
  const previewMatch = pathname.match(/^\/preview\/(.+)$/);
  if (previewMatch) {
    return { page: 'preview', id: parseStateKey(previewMatch[1]) };
  }

  return { page: 'notFound', path: pathname };
}
