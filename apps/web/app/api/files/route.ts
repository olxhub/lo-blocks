// src/app/api/files/route.ts
//
// File listing and glob API.
//
// GET /api/files           - Returns file tree
// GET /api/files?pattern=  - Returns files matching glob pattern
//
import { getStorageManager } from '@/lib/lofs/storageManager';
import { toOlxRelativePath } from '@/lib/lofs/types';

// Lazy — initialized on first request after instrumentation hook has run.
let _provider: ReturnType<ReturnType<typeof getStorageManager>['getDefaultProvider']>;
function getDefaultProvider() {
  if (!_provider) _provider = getStorageManager().getDefaultProvider();
  return _provider;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pattern = url.searchParams.get('pattern');
  let rawBasePath = url.searchParams.get('path') || undefined;

  // Strip namespace prefix if present (client sends "content/..." but FileStorageProvider expects relative paths)
  if (rawBasePath?.startsWith('content/')) {
    rawBasePath = rawBasePath.slice('content/'.length) || undefined;
  } else if (rawBasePath === 'content') {
    rawBasePath = undefined;
  }

  // Brand at trust boundary — path comes from HTTP request (untrusted)
  let basePath;
  try {
    basePath = rawBasePath ? toOlxRelativePath(rawBasePath) : undefined;
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }

  try {
    if (pattern) {
      // Glob mode - return array of matching files
      const files = await getDefaultProvider().glob(pattern, basePath);
      return Response.json({ ok: true, files });
    } else {
      // Tree mode - return full file tree
      const tree = await getDefaultProvider().listFiles();
      return Response.json({ ok: true, tree });
    }
  } catch (err: any) {
    console.error(`[API /files] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
