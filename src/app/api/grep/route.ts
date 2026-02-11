// src/app/api/grep/route.ts
//
// Content search API.
//
// GET /api/grep?pattern=    - Search file contents for pattern
// GET /api/grep?pattern=&path=&include=&limit=  - With options
//
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { toOlxRelativePath } from '@/lib/lofs/types';

const provider = new FileStorageProvider('./content');

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

  let rawBasePath = url.searchParams.get('path') || undefined;
  const include = url.searchParams.get('include') || undefined;
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  // Strip namespace prefix if present (client sends "content/..." but FileStorageProvider expects relative paths)
  if (rawBasePath?.startsWith('content/')) {
    rawBasePath = rawBasePath.slice('content/'.length) || undefined;
  } else if (rawBasePath === 'content') {
    rawBasePath = undefined;
  }

  // Brand at trust boundary — path comes from HTTP request (untrusted)
  const basePath = rawBasePath ? toOlxRelativePath(rawBasePath, 'grep API path') : undefined;

  try {
    const matches = await provider.grep(pattern, { basePath, include, limit });
    return Response.json({ ok: true, matches });
  } catch (err: any) {
    console.error(`[API /grep] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
