import { promises as fs } from 'fs';
import path from 'path';

async function resolvePath(relPath) {
  if (typeof relPath !== 'string' || relPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const base = path.resolve(process.cwd(), 'content');
  const full = path.resolve(base, relPath);

  // Check we're inside the right directory
  const relative = path.relative(base, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid path');
  }

  // Avoid symlinks
  const stats = await fs.lstat(full).catch(() => null);
  if (stats && stats.isSymbolicLink()) throw new Error('Symlinks not allowed');

  // Check file types. To be extended.
  if (!full.endsWith('.xml') && !full.endsWith('.olx')) {
    throw new Error('Invalid file type');
  }

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
    const content = await fs.readFile(await resolvePath(relPath), 'utf-8');
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
    await fs.writeFile(await resolvePath(relPath), content, 'utf-8');
    return Response.json({ ok: true });
  } catch (err) {
    console.log(err.message);
    return Response.json({ ok: false, error: failed }, { status: 500 });
  }
}
