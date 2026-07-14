// packages/shared/lib/content/staticAssetSync.ts
//
// Static asset synchronization - copies content assets to the server's
// public directory, served at /content/* by apps/server (Hono serveStatic).
//
// Handles the automatic copying of static files (images, documents, media)
// from the content directory to the public directory. Interim measure: once
// content lives in the git object lake, assets are served by hash and this
// copy step dissolves.
//
// The sync process preserves directory structure and only copies recognized
// asset files, avoiding unnecessary files in the public directory.
//
import fs from 'fs/promises';
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import type { StorageProvider } from '@/lib/types/storage';

const ASSET_EXTS_WITH_DOTS = extensionsWithDots(CATEGORY.media);

/**
 * Filesystem roots to copy assets from, with their URL prefixes.
 *
 * Only filesystem-backed sources have local assets to copy. A FileStorageProvider
 * contributes its own `baseDir`, at a URL prefix equal to its mountPoint past
 * "content" \u2014 so the fallback (mountPoint "content") copies to the root and a
 * directory mount (mountPoint "content/<mount>") copies under "<mount>", keeping
 * asset URLs aligned with content paths. Non-filesystem sources (git, memory,
 * network) have no local assets \u2014 repo-source assets are deferred (forge URLs /
 * a blob route). instanceof rather than field-sniffing: a rename breaks the
 * build, and static-asset copying stays out of the StorageProvider interface.
 */
// TODO(local-git-assets): only FileStorageProvider-backed sources contribute
// asset roots. A { dir, worktree: false } local-git source (added 2026-07) has
// assets on disk but is invisible here — its images would 404. Latent: no
// deployment uses that config yet, and this whole copy step dissolves under
// the asset-store design (serve by hash). Fix here only if a worktree:false
// deployment ships before the asset store does.
function assetRoots(providers: StorageProvider[]): { dir: string; prefix: string }[] {
  const roots: { dir: string; prefix: string }[] = [];
  for (const provider of providers) {
    if (provider instanceof FileStorageProvider) {
      roots.push({ dir: provider.baseDir, prefix: provider.mountPoint.replace(/^content\/?/, '') });
    }
  }
  return roots;
}

export async function copyAssetsToPublic(providers: StorageProvider[], targetDir = './apps/server/public/content') {
  const publicContentDir = targetDir;

  try {
    await fs.mkdir(publicContentDir, { recursive: true });
    for (const { dir, prefix } of assetRoots(providers)) {
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
