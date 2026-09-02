// packages/shared/lib/content/staticAssetSync.ts
//
// Static asset synchronization - mirrors content assets into the server's
// public directory, served at /content/* by apps/server (Hono serveStatic).
//
// Copies static files (images, video, documents) from the filesystem
// content sources to the public directory. Interim measure: once content
// lives in the git object lake, assets are served by hash and this copy
// step dissolves.
//
// THE SYNC RULE: the target is a mirror, computed fresh each call from
// what is on disk right now.
//
//   - a target file missing, a different size, or an mtime more than a
//     millisecond from its source's is (re)copied, and the copy is stamped
//     with the source's mtime so the next call compares the two directly
//     (MTIME_EPSILON_MS explains the millisecond);
//   - a target file whose source is gone is deleted (the target directory
//     is generated - gitignored, wiped by `npm run clean` - so nothing
//     there is authoritative), and directories emptied by that are pruned;
//   - everything else is left alone: an unchanged tree costs one stat per
//     asset and writes nothing.
//
// Deletion is scoped to the extensions this function manages
// (CATEGORY.media). A target directory can be shared with another build
// step (`sync-images --target apps/static/dist/content`), and files it
// never created are not its to remove.
//
// Being self-sufficient is the point: syncContentFromStorage calls this on
// every sync, including the syncs the websocket event path triggers, so it
// must be cheap when nothing changed AND must not need a content-file edit
// to notice that an image was replaced in place.
//
import fs from 'fs/promises';
import path from 'path';
import { extensionsWithDots, CATEGORY } from '@/lib/util/fileTypes';
import { FileStorageProvider } from '@/lib/storage/lofs/providers/file';
import { StackedStorageProvider } from '@/lib/storage/lofs/providers/stacked';
import type { StorageProvider } from '@/lib/types/storage';

const ASSET_EXTS_WITH_DOTS = extensionsWithDots(CATEGORY.media);

function isAssetName(name: string): boolean {
  return ASSET_EXTS_WITH_DOTS.some(ext => name.toLowerCase().endsWith(ext));
}

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
 * URL - an authoring conflict, warned in the collect loop. Non-filesystem
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
    // Same relative path from two sources = one URL, last source wins - that
    // must not be silent.
    const seen = new Map<string, string>();
    /** Target-relative path -> the source file that should be there. */
    const wanted = new Map<string, string>();
    for (const { dir } of assetRoots(provider)) {
      await collectAssets(dir, dir, wanted, seen);
    }

    let copied = 0;
    for (const [rel, sourcePath] of wanted) {
      if (await copyIfDifferent(sourcePath, path.join(publicContentDir, rel))) copied++;
    }
    const removed = await removeOrphans(publicContentDir, publicContentDir, wanted);

    // Silent when the mirror was already correct: this runs on the event
    // path, and a line per keystroke is how the old unconditional copy
    // announced itself.
    if (copied > 0 || removed > 0) {
      console.log(`✅ Assets synced to ${publicContentDir}`
        + ` (${copied} copied, ${removed} removed)`);
    }
  } catch (error) {
    console.warn('⚠️  Failed to sync assets to public directory:', error.message);
  }
}

/** Index every asset under `sourceDir` by its path relative to `root`. */
async function collectAssets(
  sourceDir: string,
  root: string,
  wanted: Map<string, string>,
  seen: Map<string, string>,
): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const sourcePath = path.join(sourceDir, entry.name);

    if (entry.isDirectory()) {
      await collectAssets(sourcePath, root, wanted, seen);
    } else if (entry.isFile() && isAssetName(entry.name)) {
      const rel = path.relative(root, sourcePath);
      const prior = seen.get(rel);
      if (prior && prior !== root) {
        console.warn(`Asset collision: ${rel} exists in both ${prior} and ${root}; serving the latter.`);
      }
      seen.set(rel, root);
      wanted.set(rel, sourcePath);
    }
  }
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;   // missing (or unreadable) - either way, copy it
  }
}

/**
 * How far apart two mtimes may be and still count as the same instant.
 *
 * The copy is stamped with its source's mtime so the two can be compared
 * directly, and that stamp does not survive to the last digit: fs.utimes
 * takes seconds, and converting a millisecond float to seconds and back
 * loses about a microsecond. So "same mtime" is a millisecond window, not
 * equality. (Comparing at Math.trunc instead is nearly as good but not
 * quite: a source whose mtime sits a hair above a millisecond boundary can
 * land a hair below it after stamping, and that one file then re-copies on
 * every sync forever. The window has no boundary to straddle.)
 *
 * What the window costs: a same-SIZE rewrite of a source within a
 * millisecond of its own previous mtime is invisible. Nothing that edits
 * content does that.
 */
const MTIME_EPSILON_MS = 1;

/** Copy when the target differs from its source; return whether it did. */
async function copyIfDifferent(sourcePath: string, targetPath: string): Promise<boolean> {
  const src = await fs.stat(sourcePath);
  const dest = await statOrNull(targetPath);
  if (dest
    && dest.size === src.size
    && Math.abs(dest.mtimeMs - src.mtimeMs) < MTIME_EPSILON_MS) return false;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  // Stamp the source's timestamps on the copy. Without this the copy's
  // mtime is the time it was made, which never equals its source's, so
  // every call would recopy every asset - the cost this comparison exists
  // to avoid. Seconds as a float, not the Stats Date: that Date is the
  // mtime ROUNDED to the millisecond, which lands half of all files a
  // millisecond ahead of their source and re-copies them forever.
  await fs.utimes(targetPath, src.atimeMs / 1000, src.mtimeMs / 1000);
  return true;
}

/**
 * Delete managed files under `dir` that no source claims, and prune the
 * directories that empties. Returns how many files were removed.
 */
async function removeOrphans(
  dir: string,
  root: string,
  wanted: Map<string, string>,
): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      removed += await removeOrphans(fullPath, root, wanted);
      // Prune only what this pass emptied; a directory of unmanaged files
      // stays. rmdir on a non-empty directory fails, which is the check.
      await fs.rmdir(fullPath).catch(() => { /* not empty - keep it */ });
    } else if (entry.isFile() && isAssetName(entry.name)) {
      if (!wanted.has(path.relative(root, fullPath))) {
        await fs.rm(fullPath);
        removed++;
      }
    }
  }

  return removed;
}
