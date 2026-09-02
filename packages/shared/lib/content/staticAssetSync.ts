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
import { FileStorageProvider } from '@/lib/storage/lofs/providers/file';
import { StackedStorageProvider } from '@/lib/storage/lofs/providers/stacked';
import type { StorageProvider } from '@/lib/types/storage';

const ASSET_EXTS_WITH_DOTS = extensionsWithDots(CATEGORY.media);

/**
 * Filesystem roots to copy assets from.
 *
 * Only filesystem-backed sources have local assets to copy. A stack contributes
 * its children's roots. Every root copies to the TARGET ROOT, with no
 * per-mount prefix: parsed asset srcs are source-relative paths
 * (parsers.assetSrc -> resolveRelativePath) and the client requests
 * /content/<that path> with no mount segment, so the copy must mirror that
 * shape or URLs and files diverge (they did: dev copied under <mount>/ while
 * pages requested the bare path, and only stray xml2json-run copies at the
 * root made images appear to work). Same relative path in two sources is one
 * URL - an authoring conflict, warned in the copy loop. Non-filesystem
 * sources (git, memory, network) have no local assets - repo-source assets
 * are deferred (forge URLs / a blob route). instanceof rather than
 * field-sniffing: a rename breaks the build, and static-asset copying stays
 * out of the StorageProvider interface.
 */
function assetRoots(provider: StorageProvider): { dir: string }[] {
  if (provider instanceof StackedStorageProvider) {
    return provider.providers.flatMap(assetRoots);
  }
  if (provider instanceof FileStorageProvider) {
    return [{ dir: provider.baseDir }];
  }
  return [];
}

export async function copyAssetsToPublic(provider: StorageProvider, targetDir = './apps/server/public/content') {
  const publicContentDir = targetDir;

  try {
    await fs.mkdir(publicContentDir, { recursive: true });
    // Same relative path from two sources = one URL, last copy wins - that
    // must not be silent.
    const seen = new Map<string, string>();
    for (const { dir } of assetRoots(provider)) {
      await copyAssetsRecursive(dir, publicContentDir, dir, seen);
    }
    console.log(`\u2705 Assets copied to ${publicContentDir}`);
  } catch (error) {
    console.warn('\u26a0\ufe0f  Failed to copy assets to public directory:', error.message);
  }
}

async function copyAssetsRecursive(sourceDir, targetDir, root, seen) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyAssetsRecursive(sourcePath, targetPath, root, seen);
    } else if (entry.isFile() && ASSET_EXTS_WITH_DOTS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      const rel = path.relative(root, sourcePath);
      const prior = seen.get(rel);
      if (prior && prior !== root) {
        console.warn(`Asset collision: ${rel} exists in both ${prior} and ${root}; serving the latter.`);
      }
      seen.set(rel, root);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
