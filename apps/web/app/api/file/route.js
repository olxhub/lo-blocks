// apps/web/app/api/file/route.js
//
// Single-file content API, origin-scoped.
//
// Every request names a repo-relative `path`. A `source` (origin) selects which
// content source it targets:
//   - reads (GET) may omit `source` → the compile/preview UNION across sources;
//   - writes (POST/DELETE/PUT) REQUIRE `source` — a union write has no defined
//     target, which was the wrong-repo-save bug. See contentSources.ts.
//
import { readProvider, writableSourceProvider, ReadOnlySourceError } from '@/lib/lofs/contentSources';
import { toLofsOrigin } from '@/lib/types/address';
import { VersionConflictError } from '@/lib/types/storage';
import { toRepoRelativePath } from '@/lib/lofs/repoPath';

// Resolved per request (re-reads config; git clones cached). See contentSources.ts.

const fail = (error, status) => Response.json({ ok: false, error }, { status });

/** A write must name its target source — 400 if it doesn't. Returns the error
 *  Response, or null when a source is present. */
function requireSource(source, action) {
  if (!source) return fail(`A "source" is required to ${action} (which repo to commit to)`, 400);
  return null;
}

/** Brand an untrusted `?path=` as a RepoRelativePath, or return a 400 Response.
 *  Discriminate the result with `instanceof Response`. */
function brandPath(raw) {
  try {
    return toRepoRelativePath(raw);
  } catch (err) {
    return fail(err.message, 400);
  }
}

/** Map a thrown storage error to a Response: 403 read-only, 404 missing file,
 *  else 500. Always returns a Response (the 403 branch is a no-op for reads). */
function mapFileError(err, fallbackPath, tag) {
  if (err instanceof ReadOnlySourceError || err.name === 'ReadOnlySourceError') {
    return fail(err.message, 403);
  }
  const isNotFound = err.code === 'ENOENT' || String(err.message).includes('not found');
  const error = isNotFound ? `File not found: ${fallbackPath}` : err.message;
  console.error(`[API /file ${tag}] ${error}`);
  return fail(error, isNotFound ? 404 : 500);
}

export async function GET(request) {
  const url = new URL(request.url);
  const path = brandPath(url.searchParams.get('path'));
  if (path instanceof Response) return path;

  try {
    const provider = await readProvider(url.searchParams.get('source'));
    const result = await provider.read(path);
    return Response.json({ ok: true, content: result.content, metadata: result.metadata, ns: result.ns });
  } catch (err) {
    return mapFileError(err, path, 'GET');
  }
}

export async function POST(request) {
  const { path: rawPath, source, content, previousMetadata, force } = await request.json();

  const missing = requireSource(source, 'save');
  if (missing) return missing;
  if (typeof content !== 'string') return fail('content must be a string', 400);
  if (content.length > 100_000) return fail('File too large (max 100KB)', 400);

  const path = brandPath(rawPath);
  if (path instanceof Response) return path;

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.write(path, content, { previousMetadata, force });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
      console.warn(`[API /file POST] Conflict: ${err.message}`);
      return Response.json({ ok: false, conflict: true, error: err.message, metadata: err.currentMetadata }, { status: 409 });
    }
    return mapFileError(err, path, 'POST');
  }
}

export async function DELETE(request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');

  const missing = requireSource(source, 'delete');
  if (missing) return missing;

  const path = brandPath(url.searchParams.get('path'));
  if (path instanceof Response) return path;

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.delete(path);
    return Response.json({ ok: true });
  } catch (err) {
    return mapFileError(err, path, 'DELETE');
  }
}

export async function PUT(request) {
  const { path: rawPath, newPath: rawNewPath, source } = await request.json();

  const missing = requireSource(source, 'rename');
  if (missing) return missing;

  const path = brandPath(rawPath);
  if (path instanceof Response) return path;
  const newPath = brandPath(rawNewPath);
  if (newPath instanceof Response) return newPath;

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.rename(path, newPath);
    return Response.json({ ok: true });
  } catch (err) {
    return mapFileError(err, path, 'PUT');
  }
}
