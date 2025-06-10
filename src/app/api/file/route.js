import { promises as fs } from 'fs';
import path from 'path';

function resolvePath(relPath) {
  const base = path.resolve(process.cwd(), 'content');
  const full = path.resolve(base, relPath);
  if (!full.startsWith(base)) {
    throw new Error('Invalid path');
  }
  return full;
}

export async function GET(request) {
  const url = new URL(request.url);
  const relPath = url.searchParams.get('path');
  if (!relPath) {
    return Response.json({ ok: false, error: 'Missing path' }, { status: 400 });
  }
  try {
    const content = await fs.readFile(resolvePath(relPath), 'utf-8');
    return Response.json({ ok: true, content });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { path: relPath, content } = await request.json();
  if (!relPath) {
    return Response.json({ ok: false, error: 'Missing path' }, { status: 400 });
  }
  try {
    await fs.writeFile(resolvePath(relPath), content, 'utf-8');
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
