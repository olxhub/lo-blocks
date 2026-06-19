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
import { unionProvider, sourceProvider, writableSourceProvider, ReadOnlySourceError } from '@/lib/lofs/contentSources';
import { toLofsOrigin } from '@/lib/types/address';
import { VersionConflictError } from '@/lib/types/storage';
import { validateRepoRelativePath } from '@/lib/lofs/contentPaths';

// Resolved per request (re-reads config; git clones cached). See contentSources.ts.

/** Reads/searches: scope to a source, or span the union when none is given. */
function readProvider(source) {
  return source ? sourceProvider(toLofsOrigin(source)) : unionProvider();
}

export async function GET(request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');

  const validation = validateRepoRelativePath(url.searchParams.get('path'));
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const provider = await readProvider(source);
    const result = await provider.read(validation.relativePath);
    return Response.json({ ok: true, content: result.content, metadata: result.metadata, ns: result.ns });
  } catch (err) {
    const isNotFound = err.code === 'ENOENT' || String(err.message).includes('not found');
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${validation.relativePath}` : err.message;
    console.error(`[API /file GET] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}

export async function POST(request) {
  const { path, source, content, previousMetadata, force } = await request.json();

  if (!source) {
    return Response.json({ ok: false, error: 'A "source" is required to save (which repo to commit to)' }, { status: 400 });
  }
  if (typeof content !== 'string') {
    return Response.json({ ok: false, error: 'content must be a string' }, { status: 400 });
  }
  if (content.length > 100_000) {
    return Response.json({ ok: false, error: 'File too large (max 100KB)' }, { status: 400 });
  }

  const validation = validateRepoRelativePath(path);
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.write(validation.relativePath, content, { previousMetadata, force });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ReadOnlySourceError || err.name === 'ReadOnlySourceError') {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
      console.warn(`[API /file POST] Conflict: ${err.message}`);
      return Response.json({ ok: false, conflict: true, error: err.message, metadata: err.currentMetadata }, { status: 409 });
    }
    console.error(`[API /file POST] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');

  if (!source) {
    return Response.json({ ok: false, error: 'A "source" is required to delete (which repo to commit to)' }, { status: 400 });
  }

  const validation = validateRepoRelativePath(url.searchParams.get('path'));
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.delete(validation.relativePath);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ReadOnlySourceError || err.name === 'ReadOnlySourceError') {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    const isNotFound = err.code === 'ENOENT' || String(err.message).includes('not found');
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${validation.relativePath}` : err.message;
    console.error(`[API /file DELETE] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}

export async function PUT(request) {
  const { path, newPath, source } = await request.json();

  if (!source) {
    return Response.json({ ok: false, error: 'A "source" is required to rename (which repo to commit to)' }, { status: 400 });
  }

  const srcValidation = validateRepoRelativePath(path);
  if (!srcValidation.valid) {
    return Response.json({ ok: false, error: srcValidation.error }, { status: 400 });
  }
  const dstValidation = validateRepoRelativePath(newPath);
  if (!dstValidation.valid) {
    return Response.json({ ok: false, error: dstValidation.error }, { status: 400 });
  }

  try {
    const provider = await writableSourceProvider(toLofsOrigin(source));
    await provider.rename(srcValidation.relativePath, dstValidation.relativePath);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ReadOnlySourceError || err.name === 'ReadOnlySourceError') {
      return Response.json({ ok: false, error: err.message }, { status: 403 });
    }
    const isNotFound = err.code === 'ENOENT' || String(err.message).includes('not found');
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${srcValidation.relativePath}` : err.message;
    console.error(`[API /file PUT] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}
