// src/app/api/files/route.ts
//
// File listing and glob API.
//
// GET /api/files           - Returns file tree
// GET /api/files?pattern=  - Returns files matching glob pattern
//
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { toOlxRelativePath } from '@/lib/lofs/types';

const provider = new FileStorageProvider('./content');

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
  const basePath = rawBasePath ? toOlxRelativePath(rawBasePath, 'files API path') : undefined;

  try {
    if (pattern) {
      // Glob mode - return array of matching files
      const files = await provider.glob(pattern, basePath);
      return Response.json({ ok: true, files });
    } else {
      // Tree mode - return full file tree
      const tree = await provider.listFiles();
      return Response.json({ ok: true, tree });
    }
  } catch (err: any) {
    console.error(`[API /files] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
