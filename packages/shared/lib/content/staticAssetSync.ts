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
 * Recurses through StackedStorageProvider layers and collects every filesystem
 * source's `baseDir`. The URL prefix is the part of the provider's mountPoint
 * past "content" \u2014 so the fallback (mountPoint "content") copies to the root,
 * and a directory mount (mountPoint "content/<mount>") copies under "<mount>",
 * keeping asset URLs aligned with content paths. Non-filesystem sources (git,
 * memory, network) have no `baseDir` and are skipped (repo-source assets are
 * deferred \u2014 forge URLs / a blob route).
 */
function assetRoots(provider): { dir: string; prefix: string }[] {
  const roots: { dir: string; prefix: string }[] = [];
  const visit = (p: any) => {
    if (Array.isArray(p?.providers)) { p.providers.forEach(visit); return; }  // stacked: recurse
    if (p?.baseDir) {
      const prefix = typeof p.mountPoint === 'string' ? p.mountPoint.replace(/^content\/?/, '') : '';
      roots.push({ dir: p.baseDir, prefix });
    }
  };
  visit(provider);
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
