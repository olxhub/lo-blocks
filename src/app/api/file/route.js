// src/app/api/file/route.js
import fs from 'fs/promises';
import path from 'path';
import { FileStorageProvider } from '@/lib/storage/providers/file';
import { validateContentPath } from '@/lib/storage/contentPaths';

const provider = new FileStorageProvider('./content');
const CONTENT_DIR = './content';

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

export async function DELETE(request) {
  const url = new URL(request.url);
  const relPath = url.searchParams.get('path');

  const validation = validateContentPath(relPath);
  if (!validation.valid) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }

  try {
    const fullPath = path.join(CONTENT_DIR, validation.relativePath);
    await fs.unlink(fullPath);
    return Response.json({ ok: true });
  } catch (err) {
    const isNotFound = err.code === 'ENOENT';
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${relPath}` : err.message;
    console.error(`[API /file DELETE] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}

export async function PUT(request) {
  const { path: relPath, newPath } = await request.json();

  const srcValidation = validateContentPath(relPath);
  if (!srcValidation.valid) {
    return Response.json({ ok: false, error: srcValidation.error }, { status: 400 });
  }

  const dstValidation = validateContentPath(newPath);
  if (!dstValidation.valid) {
    return Response.json({ ok: false, error: dstValidation.error }, { status: 400 });
  }

  try {
    const srcPath = path.join(CONTENT_DIR, srcValidation.relativePath);
    const dstPath = path.join(CONTENT_DIR, dstValidation.relativePath);

    // Create destination directory if needed
    await fs.mkdir(path.dirname(dstPath), { recursive: true });

    // Rename/move the file
    await fs.rename(srcPath, dstPath);
    return Response.json({ ok: true });
  } catch (err) {
    const isNotFound = err.code === 'ENOENT';
    const status = isNotFound ? 404 : 500;
    const error = isNotFound ? `File not found: ${relPath}` : err.message;
    console.error(`[API /file PUT] ${error}`);
    return Response.json({ ok: false, error }, { status });
  }
}
