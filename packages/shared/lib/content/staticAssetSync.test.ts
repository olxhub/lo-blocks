// @vitest-environment node
// packages/shared/lib/content/staticAssetSync.test.ts
//
// The target directory is a MIRROR of the assets on disk, recomputed on
// every call. syncContentFromStorage calls this on every sync — including
// the syncs a websocket field write triggers — so the properties that
// matter are: a changed asset is noticed without any content edit, an
// unchanged one is not rewritten, and a deleted one does not linger.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { FileStorageProvider } from '../storage/lofs/providers/file';
import { copyAssetsToPublic } from './staticAssetSync';

/** 1x1 PNGs differing in bytes; the second is longer, the third same-length. */
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwABAQEAdvzUAAAAAElFTkSuQmCC', 'base64');
const PNG_B = Buffer.concat([PNG_A, Buffer.from('trailing bytes so the size differs')]);
const PNG_C = Buffer.from(PNG_A);
PNG_C[PNG_C.length - 1] ^= 0xff;   // same size, different content

async function withDirs(
  fn: (source: string, target: string, provider: FileStorageProvider) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-sync-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await fs.mkdir(source, { recursive: true });
  try {
    await fn(source, target, new FileStorageProvider(source, 'src'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

it('copies assets into the target, preserving their relative paths', async () => {
  await withDirs(async (source, target, provider) => {
    await fs.mkdir(path.join(source, 'unit1/images'), { recursive: true });
    await fs.writeFile(path.join(source, 'unit1/images/pixel.png'), PNG_A);
    await fs.writeFile(path.join(source, 'lesson.olx'), '<Markdown id="a">Hi</Markdown>');

    await copyAssetsToPublic(provider, target);

    expect(await fs.readFile(path.join(target, 'unit1/images/pixel.png'))).toEqual(PNG_A);
    // Only media is mirrored — the OLX is served from storage, not /content.
    await expect(fs.stat(path.join(target, 'lesson.olx'))).rejects.toThrow();
  });
});

it('re-copies an asset replaced in place, with no content file edited', async () => {
  await withDirs(async (source, target, provider) => {
    const src = path.join(source, 'pixel.png');
    const dest = path.join(target, 'pixel.png');
    await fs.writeFile(src, PNG_A);
    await copyAssetsToPublic(provider, target);
    expect(await fs.readFile(dest)).toEqual(PNG_A);

    // Same name, same SIZE, new bytes: nothing but the mtime distinguishes
    // it, which is why size alone is not the test. (mtime granularity can
    // be coarse; nudge the clock so the write is visible either way.)
    await new Promise(r => setTimeout(r, 20));
    await fs.writeFile(src, PNG_C);
    await copyAssetsToPublic(provider, target);
    expect(await fs.readFile(dest)).toEqual(PNG_C);

    // A different size, caught whatever the timestamps say.
    await new Promise(r => setTimeout(r, 20));
    await fs.writeFile(src, PNG_B);
    await copyAssetsToPublic(provider, target);
    expect(await fs.readFile(dest)).toEqual(PNG_B);
  });
});

it('leaves unchanged assets alone, whatever their mtime precision', async () => {
  // Many files, not one: a fresh write gets a sub-millisecond mtime, and a
  // stamp that rounds it lands about half of them a millisecond off their
  // source — which re-copies them on every sync, forever. One file catches
  // that on a coin flip; a dozen catch it every time.
  await withDirs(async (source, target, provider) => {
    const names = Array.from({ length: 12 }, (_, i) => `pixel${i}.png`);
    for (const name of names) await fs.writeFile(path.join(source, name), PNG_A);
    await copyAssetsToPublic(provider, target);
    // ctime moves on any write to the file, including a metadata-only one,
    // and nothing this module does can set it back — so an unchanged ctime
    // across a second call is proof the copy was not rewritten.
    const before = await Promise.all(names.map(n => fs.stat(path.join(target, n))));

    await new Promise(r => setTimeout(r, 20));
    await copyAssetsToPublic(provider, target);

    const after = await Promise.all(names.map(n => fs.stat(path.join(target, n))));
    expect(after.map(s => s.ctimeMs)).toEqual(before.map(s => s.ctimeMs));
    expect(after.map(s => s.mtimeMs)).toEqual(before.map(s => s.mtimeMs));
  });
});

it('deletes copies whose source is gone, and prunes the directories they emptied', async () => {
  await withDirs(async (source, target, provider) => {
    await fs.mkdir(path.join(source, 'unit1'), { recursive: true });
    await fs.writeFile(path.join(source, 'unit1/gone.png'), PNG_A);
    await fs.writeFile(path.join(source, 'kept.png'), PNG_A);
    await copyAssetsToPublic(provider, target);
    expect(await fs.stat(path.join(target, 'unit1/gone.png'))).toBeDefined();

    await fs.rm(path.join(source, 'unit1/gone.png'));
    await copyAssetsToPublic(provider, target);

    await expect(fs.stat(path.join(target, 'unit1/gone.png'))).rejects.toThrow();
    await expect(fs.stat(path.join(target, 'unit1'))).rejects.toThrow();
    expect(await fs.readFile(path.join(target, 'kept.png'))).toEqual(PNG_A);
  });
});

it('leaves files it does not manage in the target directory', async () => {
  // A target can be shared with another build step (`sync-images --target
  // apps/static/dist/content`); non-media files there are not ours to remove.
  await withDirs(async (source, target, provider) => {
    await fs.writeFile(path.join(source, 'pixel.png'), PNG_A);
    await copyAssetsToPublic(provider, target);
    await fs.writeFile(path.join(target, 'index.html'), '<!doctype html>');

    await copyAssetsToPublic(provider, target);

    expect(await fs.readFile(path.join(target, 'index.html'), 'utf-8')).toBe('<!doctype html>');
  });
});
