import { promises as fs } from 'fs';
import path from 'path';

const baseDir = path.resolve(process.cwd(), 'content');

async function walk(rel = '') {
  const dirPath = path.join(baseDir, rel);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      children.push(await walk(relPath));
    } else if (entry.isFile() && (entry.name.endsWith('.xml') || entry.name.endsWith('.olx'))) {
      children.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }
  return { name: rel.split('/').pop() || 'content', path: rel, type: 'directory', children };
}

export async function GET() {
  const tree = await walk('');
  return Response.json({ ok: true, tree });
}
