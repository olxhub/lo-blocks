// src/lib/content/staticAssetSync.ts
//
// Static asset synchronization - copies content assets to Next.js public directory.
//
// Handles the automatic copying of static files (images, documents, media)
// from the content directory to the public directory where Next.js can serve
// them. This bridges Learning Observer's content storage system with Next.js's
// static file serving requirements.
//
// The sync process preserves directory structure and only copies recognized
// asset files, avoiding unnecessary files in the public directory.
//
import fs from 'fs/promises';
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';

const ASSET_EXTS_WITH_DOTS = extensionsWithDots(CATEGORY.media);

export async function copyAssetsToPublic(provider) {
  const publicContentDir = './public/content';

  try {
    await fs.mkdir(publicContentDir, { recursive: true });
    await copyAssetsRecursive(provider.baseDir, publicContentDir);
    console.log(`\u2705 Assets copied to ${publicContentDir}`);
  } catch (error) {
    console.warn('\u26a0\ufe0f  Failed to copy assets to public directory:', error.message);
  }
}

async function copyAssetsRecursive(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyAssetsRecursive(sourcePath, targetPath);
    } else if (entry.isFile() && ASSET_EXTS_WITH_DOTS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
