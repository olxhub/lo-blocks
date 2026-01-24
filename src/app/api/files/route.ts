// src/app/api/files/route.ts
//
// File listing and glob API.
//
// GET /api/files           - Returns file tree
// GET /api/files?pattern=  - Returns files matching glob pattern
//
import { FileStorageProvider } from '@/lib/lofs/providers/file';

const provider = new FileStorageProvider('./content');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pattern = url.searchParams.get('pattern');
  let basePath = url.searchParams.get('path') || undefined;

  // Strip namespace prefix if present (client sends "content/..." but FileStorageProvider expects relative paths)
  if (basePath?.startsWith('content/')) {
    basePath = basePath.slice('content/'.length) || undefined;
  } else if (basePath === 'content') {
    basePath = undefined;
  }

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
