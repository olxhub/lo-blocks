#!/usr/bin/env tsx
/**
 * Sync static assets from content directory to a public folder for serving.
 *
 * Usage:
 *   tsx sync-images.ts                          # default: ./content → apps/web/public/content
 *   tsx sync-images.ts --source content/psychology --target dist/psych/content
 *
 * MOUNT POINT: the source is mounted at 'content', matching how xml2json.ts
 * mounts the same directory for the single-course/static build. That mount is
 * what determines the URL prefix assets are copied under (copyAssetsToPublic's
 * `prefix`), and it MUST agree with the mount that resolved the `src`
 * attributes at parse time. Letting it default to basename(source) makes the
 * prefix the checkout's directory name (e.g. 'edu.mtsu.temperance'), while the
 * parsed src stays mount-relative ('images/foo.jpg' → /content/images/foo.jpg),
 * so every image 404s in the built site.
 */

import { FileStorageProvider } from '../lib/storage/lofs/providers/file.js';
import { copyAssetsToPublic } from '../lib/content/staticAssetSync.js';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

async function main() {
  try {
    const source = getArg('--source') || './content';
    const provider = new FileStorageProvider(source, 'content');
    const target = getArg('--target');
    await copyAssetsToPublic(provider, target);
  } catch (error) {
    console.error('Failed to sync assets:', error);
    process.exit(1);
  }
}

main();
