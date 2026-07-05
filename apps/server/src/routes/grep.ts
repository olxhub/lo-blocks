// apps/server/src/routes/grep.ts
//
// Ported from apps/web/app/api/grep/route.ts (Next.js API route).
//
// Content search API, origin-scoped.
//
// GET /api/grep?pattern=                 - search across the union
// GET /api/grep?pattern=&source=<origin> - search within one source
// GET /api/grep?pattern=&path=&include=&limit=  - with options
//
import type { Context } from 'hono';
import { readProvider } from '@/lib/lofs/contentSources';
import { toOlxRelativePath } from '@/lib/types/storage';

// Provider resolved per request (re-reads config, caches git clones).

export async function handleGrep(c: Context): Promise<Response> {
  const pattern = c.req.query('pattern');

  if (!pattern) {
    return c.json(
      { ok: false, error: 'pattern parameter is required' },
      400
    );
  }

  // TODO: PAGINATION NEEDED
  // Current implementation returns all matches up to limit (default 1000).
  // With 538+ matches for "Markdown" alone, this doesn't scale:
  // - Large response payloads (JSON serialization, network transfer)
  // - Slow initial load (waiting for all matches before rendering)
  // - Memory issues on large codebases (unbounded result sets)
  //
  // Implement:
  // 1. Cursor-based pagination (offset + limit in request)
  // 2. Return { matches, nextCursor, hasMore } in response
  // 3. Client can lazily load more results as user scrolls
  // 4. Consider indexing grep results or caching frequent searches
  // 5. Add timeout to grep operations (currently unbounded)

  const source = c.req.query('source') || undefined;
  const rawBasePath = c.req.query('path') || undefined;
  const include = c.req.query('include') || undefined;
  const limitStr = c.req.query('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  // `path` here is a search BASE directory, not a content file — so it's
  // toOlxRelativePath (structural, no content-extension requirement), NOT
  // /api/file's toRepoRelativePath. Traversal is hardened in the provider
  // (grep → glob → resolveSafeReadPath). Brand at the trust boundary.
  let basePath;
  try {
    basePath = rawBasePath ? toOlxRelativePath(rawBasePath) : undefined;
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 400);
  }

  try {
    const provider = await readProvider(source);
    const matches = await provider.grep(pattern, { basePath, include, limit });
    return c.json({ ok: true, matches });
  } catch (err: any) {
    console.error(`[API /grep] ${err.message}`);
    return c.json({ ok: false, error: err.message }, 500);
  }
}
