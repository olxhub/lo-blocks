// apps/client/src/router.ts
//
// Simple pathname-based router. No library needed — just pattern matching.
// Add routes here as they migrate from Next.js.
//

export type Route =
  | { page: 'preview'; id: string }
  | { page: 'notFound'; path: string };

export function resolveRoute(pathname: string): Route {
  // /preview/:id
  const previewMatch = pathname.match(/^\/preview\/(.+)$/);
  if (previewMatch) {
    return { page: 'preview', id: previewMatch[1] };
  }

  return { page: 'notFound', path: pathname };
}
