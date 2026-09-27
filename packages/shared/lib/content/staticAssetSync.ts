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
 * Filesystem roots to copy assets from, with their URL prefixes.
 *
 * Only filesystem-backed sources have local assets to copy. A stack contributes
 * its children's roots; a FileStorageProvider contributes its own `baseDir`, at
 * a URL prefix equal to its mountPoint past "content" \u2014 so the fallback
 * (mountPoint "content") copies to the root and a directory mount
 * (mountPoint "content/<mount>") copies under "<mount>", keeping asset URLs
 * aligned with content paths. Non-filesystem sources (git, memory, network)
 * have no local assets \u2014 repo-source assets are deferred (forge URLs / a blob
 * route). instanceof rather than field-sniffing: a rename breaks the build, and
 * static-asset copying stays out of the StorageProvider interface.
 */
function assetRoots(provider: StorageProvider): { dir: string; prefix: string }[] {
  if (provider instanceof StackedStorageProvider) {
    return provider.providers.flatMap(assetRoots);
  }
  if (provider instanceof FileStorageProvider) {
    return [{ dir: provider.baseDir, prefix: provider.mountPoint.replace(/^content\/?/, '') }];
  }
  return [];
}

/**
 * The default target, which is SHARED MUTABLE STATE under test.
 *
 * `syncContentFromStorage` calls this unconditionally, so every test that loads
 * content writes into one process-relative directory -- seven test files here,
 * one of them (`xml2graph.test.ts`) from a SEPARATE SPAWNED PROCESS, so the
 * contention is cross-process and no in-process lock would see it.
 *
 * UNDER VITEST EACH PROCESS GETS ITS OWN. Nothing asserts on this directory --
 * no test reads `public/content` and none fetches `/content/*` -- so where it
 * lands does not matter, only that two writers never share it. The copy is kept
 * rather than skipped so the code path under test stays the one that ships.
 */
function defaultTarget(): string {
  const shared = './apps/server/public/content';
  if (!process.env.VITEST) return shared;
  return path.join(process.env.TMPDIR || '/tmp',
                   `lo-blocks-assets-${process.pid}`, 'content');
}

export async function copyAssetsToPublic(provider: StorageProvider, targetDir?: string) {
  const publicContentDir = targetDir ?? defaultTarget();

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
