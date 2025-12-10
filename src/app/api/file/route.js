// src/app/api/file/route.js
import { FileStorageProvider } from '@/lib/storage/providers/file';
import { validateContentPath } from '@/lib/storage/contentPaths';

const provider = new FileStorageProvider('./content');

export async function GET(request) {
  const url = new URL(request.url);
  const relPath = url.searchParams.get('path');

  const validation = validateContentPath(relPath);
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const content = await provider.read(validation.relativePath);
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

  const validation = validateContentPath(relPath);
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  if (content?.length > 100_000) {
    return Response.json({ ok: false, error: 'File too large (max 100KB)' }, { status: 400 });
  }

  try {
    await provider.write(validation.relativePath, content);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[API /file POST] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
