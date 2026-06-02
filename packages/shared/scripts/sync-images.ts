#!/usr/bin/env tsx
/**
 * Sync static assets from content directory to a public folder for serving.
 *
 * Usage:
 *   tsx sync-images.ts                          # default: ./content → apps/web/public/content
 *   tsx sync-images.ts --source content/sba/psychology --target dist/psych/content
 */

import { FileStorageProvider } from '../lib/lofs/providers/file.js';
import { copyAssetsToPublic } from '../lib/content/staticAssetSync.js';

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

async function main() {
  try {
    const source = getArg('--source') || './content';
    const provider = new FileStorageProvider(source);
    const target = getArg('--target');
    await copyAssetsToPublic(provider, target);
  } catch (error) {
    console.error('Failed to sync assets:', error);
    process.exit(1);
  }
}

main();
