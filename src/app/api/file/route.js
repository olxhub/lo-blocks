// src/app/api/file/route.js
import { FileStorageProvider } from '@/lib/storage';
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
  try {
    if (!validatePath(relPath)) throw new Error('Invalid file type');
    const content = await provider.read(relPath);
    return Response.json({ ok: true, content });
  } catch (err) {
    console.log(err.message)
    return Response.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(request) {
  const { path: relPath, content } = await request.json();
  if (!relPath) {
    return Response.json({ ok: false, error: 'Missing path' }, { status: 400 });
  }
  try {
    if (content.length > 100_000) throw new Error('File too large');
    if (!validatePath(relPath)) throw new Error('Invalid file type');
    await provider.write(relPath, content);
    return Response.json({ ok: true });
  } catch (err) {
    console.log(err.message);
    return Response.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
