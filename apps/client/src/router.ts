// apps/client/src/router.ts
//
// Simple pathname-based router. No library needed — just pattern matching.
// Add routes here as they migrate from Next.js.
//
import type { StateKey } from '@/lib/types';
import { asStateKey, validateStateKey, validateOLXTag } from '@/lib/types/id-grammar';

export type Route =
  | { page: 'preview'; id: StateKey }
  | { page: 'catalog' }
  | { page: 'repo'; origin: string }
  | { page: 'docs'; block?: string }
  | { page: 'studio' }
  | { page: 'notFound'; path: string; reason?: string; detail?: string };

export function resolveRoute(rawPathname: string): Route {
  // Trailing slashes never distinguish routes here — "/docs/" is "/docs".
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;

  // /repo/:encodedOrigin — full repository detail view
  const repoMatch = pathname.match(/^\/repo\/(.+)$/);
  if (repoMatch) {
    try {
      return { page: 'repo', origin: decodeURIComponent(repoMatch[1]) };
    } catch {
      return { page: 'notFound', path: pathname, reason: 'Malformed repository URL.' };
    }
  }

  // Catalog — the author front page.
  if (pathname === '/') {
    return { page: 'catalog' };
  }

  // /studio — the authoring environment (location travels in query params).
  if (pathname === '/studio') {
    return { page: 'studio' };
  }

  // /docs — block documentation index; /docs/:BlockName — one block's docs.
  if (pathname === '/docs') {
    return { page: 'docs' };
  }
  const docsMatch = pathname.match(/^\/docs\/(.+)$/);
  if (docsMatch) {
    const tag = decodeURIComponent(docsMatch[1]);
    const valid = validateOLXTag(tag);
    if (valid !== true) {
      return {
        page: 'notFound',
        path: pathname,
        reason: `This doesn't look like a block name. Block names are PascalCase, like /docs/Markdown.`,
        detail: valid,
      };
    }
    return { page: 'docs', block: tag };
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
