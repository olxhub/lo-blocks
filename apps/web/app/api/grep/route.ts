// apps/web/app/api/grep/route.ts
//
// Content search API, origin-scoped.
//
// GET /api/grep?pattern=                 - search across the union
// GET /api/grep?pattern=&source=<origin> - search within one source
// GET /api/grep?pattern=&path=&include=&limit=  - with options
//
import { sourceProvider, unionProvider } from '@/lib/lofs/contentSources';
import { toLofsOrigin } from '@/lib/types/address';
import { toOlxRelativePath } from '@/lib/types/storage';

// Provider resolved per request (re-reads config, caches git clones).

/** Scope to a source, or span the union when none is given. */
function readProvider(source: string | undefined) {
  return source ? sourceProvider(toLofsOrigin(source)) : unionProvider();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pattern = url.searchParams.get('pattern');

  if (!pattern) {
    return Response.json(
      { ok: false, error: 'pattern parameter is required' },
      { status: 400 }
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

  const source = url.searchParams.get('source') || undefined;
  const rawBasePath = url.searchParams.get('path') || undefined;
  const include = url.searchParams.get('include') || undefined;
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  // Brand at trust boundary — path comes from HTTP request (untrusted)
  let basePath;
  try {
    basePath = rawBasePath ? toOlxRelativePath(rawBasePath) : undefined;
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }

  try {
    const provider = await readProvider(source);
    const matches = await provider.grep(pattern, { basePath, include, limit });
    return Response.json({ ok: true, matches });
  } catch (err: any) {
    console.error(`[API /grep] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
