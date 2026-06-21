// apps/web/app/api/files/route.ts
//
// File listing and glob API, origin-scoped.
//
// GET /api/files                  - file tree (union, or one source via ?source=)
// GET /api/files?pattern=         - files matching a glob
// GET /api/files?source=<origin>  - scope to a single source (repo-relative)
//
import { readProvider } from '@/lib/lofs/contentSources';
import { toOlxRelativePath } from '@/lib/types/storage';

// Provider resolved per request (re-reads config, caches git clones).

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pattern = url.searchParams.get('pattern');
  const source = url.searchParams.get('source') || undefined;
  const rawBasePath = url.searchParams.get('path') || undefined;

  // `path` here is a glob/search BASE directory, not a content file — so it's
  // toOlxRelativePath (structural, no content-extension requirement), NOT
  // /api/file's toRepoRelativePath. Traversal is hardened in the provider
  // (FileStorageProvider.glob → resolveSafeReadPath). Brand at the trust boundary.
  let basePath;
  try {
    basePath = rawBasePath ? toOlxRelativePath(rawBasePath) : undefined;
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 400 });
  }

  try {
    const provider = await readProvider(source);
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
