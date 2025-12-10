// src/app/api/file/route.js
import { FileStorageProvider } from '@/lib/storage/providers/file';
import pegExts from '@/generated/pegExtensions.json' assert { type: 'json' };

function validatePath(relPath) {
  const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)];
  return allowed.some(ext => relPath.endsWith(ext));
}

const provider = new FileStorageProvider('./content');

export async function GET(request) {
  const url = new URL(request.url);
  const relPath = url.searchParams.get('path');
  if (!relPath) {
    return Response.json({ ok: false, error: 'Missing path' }, { status: 400 });
  }
  if (!validatePath(relPath)) {
    const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)].join(', ');
    return Response.json({
      ok: false,
      error: `Invalid file type. Path must end with: ${allowed}`
    }, { status: 400 });
  }
  try {
    const content = await provider.read(relPath);
    return Response.json({ ok: true, content });
  } catch (err) {
    const isNotFound = err.code === 'ENOENT' || err.message?.includes('not found');
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${relPath}` : err.message;
    console.error(`[API /file GET] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}

export async function POST(request) {
  const { path: relPath, content } = await request.json();
  if (!relPath) {
    return Response.json({ ok: false, error: 'Missing path' }, { status: 400 });
  }
  if (!validatePath(relPath)) {
    const allowed = ['.xml', '.olx', '.md', ...pegExts.map(e => `.${e}`)].join(', ');
    return Response.json({
      ok: false,
      error: `Invalid file type. Path must end with: ${allowed}`
    }, { status: 400 });
  }
  if (content?.length > 100_000) {
    return Response.json({ ok: false, error: 'File too large (max 100KB)' }, { status: 400 });
  }
  try {
    await provider.write(relPath, content);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[API /file POST] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
