// packages/shared/lib/content/staticAssetSync.ts
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

/**
 * Filesystem roots to copy assets from, with their URL prefixes.
 *
 * - StackedStorageProvider: flatten to its children.
 * - MountRouterProvider: fallback copies to the target root; each mounted
 *   source copies under its mount name, so asset URLs match content paths
 *   ("psychology/images/foo.png" \u2192 /content/psychology/images/foo.png).
 * - Plain filesystem provider: its baseDir at the root.
 * - Non-filesystem sources (memory, network): no baseDir, skipped.
 */
function assetRoots(provider): { dir: string; prefix: string }[] {
  const roots: { dir: string; prefix: string }[] = [];
  const flat = Array.isArray(provider.providers) ? provider.providers : [provider];
  for (const p of flat) {
    if (Array.isArray(p?.mounts) && p?.fallback) {
      // MountRouterProvider
      if (p.fallback?.baseDir) roots.push({ dir: p.fallback.baseDir, prefix: '' });
      for (const m of p.mounts) {
        if (m.baseDir) roots.push({ dir: m.baseDir, prefix: m.mount });
      }
    } else if (p?.baseDir) {
      roots.push({ dir: p.baseDir, prefix: '' });
    }
  }
  return roots;
}

export async function copyAssetsToPublic(provider, targetDir = './apps/web/public/content') {
  const publicContentDir = targetDir;

  try {
    await fs.mkdir(publicContentDir, { recursive: true });
    for (const { dir, prefix } of assetRoots(provider)) {
      await copyAssetsRecursive(dir, path.join(publicContentDir, prefix));
    }
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
