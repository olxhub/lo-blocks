// apps/server/src/routes/file.ts
//
// Ported from apps/web/app/api/file/route.js (Next.js API route).
//
// Single-file content API, origin-scoped.
//
// Every request names a repo-relative `path`. A `source` (origin) selects which
// content source it targets:
//   - reads (GET) may omit `source` → the compile/preview UNION across sources;
//   - writes (POST/DELETE/PUT) REQUIRE `source` — a union write has no defined
//     target, which was the wrong-repo-save bug. See contentSources.ts.
//
import type { Context } from 'hono';
import { readProvider, writableSourceProvider, ReadOnlySourceError } from '@/lib/lofs/contentSources';
import { VersionConflictError } from '@/lib/types/storage';
import type { RepoRelativePath } from '@/lib/types';
import { toRepoRelativePath } from '@/lib/lofs/repoPath';

// Resolved per request (re-reads config; git clones cached). See contentSources.ts.

const fail = (c: Context, error: string, status: 400 | 403 | 404 | 409 | 500): Response =>
  c.json({ ok: false, error }, status);

/** A write must name its target source — 400 if it doesn't. Returns the error
 *  Response, or null when a source is present. */
function requireSource(c: Context, source: string | undefined | null, action: string): Response | null {
  if (!source) return fail(c, `A "source" is required to ${action} (which repo to commit to)`, 400);
  return null;
}

/** Brand an untrusted `?path=` as a RepoRelativePath, or return a 400 Response.
 *  Discriminate the result with `instanceof Response`. */
function brandPath(c: Context, raw: unknown): RepoRelativePath | Response {
  try {
    // Untrusted input: non-strings make toRepoRelativePath throw, which the
    // catch maps to a 400 — same behavior as the original JS route.
    return toRepoRelativePath(raw as string);
  } catch (err: any) {
    return fail(c, err.message, 400);
  }
}

/** Map a thrown storage error to a Response: 403 read-only, 404 missing file,
 *  else 500. Always returns a Response (the 403 branch is a no-op for reads). */
function mapFileError(c: Context, err: any, fallbackPath: unknown, tag: string): Response {
  if (err instanceof ReadOnlySourceError || err.name === 'ReadOnlySourceError') {
    return fail(c, err.message, 403);
  }
  const isNotFound = err.code === 'ENOENT' || String(err.message).includes('not found');
  const error = isNotFound ? `File not found: ${fallbackPath}` : err.message;
  console.error(`[API /file ${tag}] ${error}`);
  return fail(c, error, isNotFound ? 404 : 500);
}

export async function handleFileGet(c: Context): Promise<Response> {
  const path = brandPath(c, c.req.query('path'));
  if (path instanceof Response) return path;

  try {
    const provider = await readProvider(c.req.query('source'));
    const result = await provider.read(path);
    return c.json({ ok: true, content: result.content, metadata: result.metadata, ns: result.ns });
  } catch (err: any) {
    return mapFileError(c, err, path, 'GET');
  }
}

export async function handleFilePost(c: Context): Promise<Response> {
  const { path: rawPath, source, content, previousMetadata, force, create } = await c.req.json();

  const missing = requireSource(c, source, 'save');
  if (missing) return missing;
  if (typeof content !== 'string') return fail(c, 'content must be a string', 400);
  if (content.length > 100_000) return fail(c, 'File too large (max 100KB)', 400);

  const path = brandPath(c, rawPath);
  if (path instanceof Response) return path;

  try {
    const provider = await writableSourceProvider(source);
    // A create must not clobber an existing file. Interim: a read-then-write
    // existence pre-check here (a TOCTOU race is acceptable for now; atomic
    // create — lofs-api lease:'absent' — is a tasklist follow-up).
    if (create) {
      let exists = true;
      try {
        await provider.read(path);
      } catch (err: any) {
        if (err.code === 'ENOENT' || String(err.message).includes('not found')) exists = false;
        else throw err;  // a real read failure — surface it, don't create over it
      }
      if (exists) return fail(c, `File already exists: ${path}`, 409);
    }
    await provider.save(path, content, { previousMetadata, force });
    return c.json({ ok: true });
  } catch (err: any) {
    if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
      console.warn(`[API /file POST] Conflict: ${err.message}`);
      return c.json({ ok: false, conflict: true, error: err.message, metadata: err.currentMetadata }, 409);
    }
    return mapFileError(c, err, path, 'POST');
  }
}

export async function handleFileDelete(c: Context): Promise<Response> {
  const source = c.req.query('source');

  const missing = requireSource(c, source, 'delete');
  if (missing) return missing;

  const path = brandPath(c, c.req.query('path'));
  if (path instanceof Response) return path;

  try {
    const provider = await writableSourceProvider(source!);
    await provider.remove(path);
    return c.json({ ok: true });
  } catch (err: any) {
    return mapFileError(c, err, path, 'DELETE');
  }
}

export async function handleFilePut(c: Context): Promise<Response> {
  const { path: rawPath, newPath: rawNewPath, source } = await c.req.json();

  const missing = requireSource(c, source, 'rename');
  if (missing) return missing;

  const path = brandPath(c, rawPath);
  if (path instanceof Response) return path;
  const newPath = brandPath(c, rawNewPath);
  if (newPath instanceof Response) return newPath;

  try {
    const provider = await writableSourceProvider(source);
    await provider.move(path, newPath);
    return c.json({ ok: true });
  } catch (err: any) {
    return mapFileError(c, err, path, 'PUT');
  }
}
