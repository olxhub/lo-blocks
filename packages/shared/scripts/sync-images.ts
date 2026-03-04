#!/usr/bin/env tsx
/**
 * Sync static assets from content directory to public folder for Next.js static serving
 */

import { FileStorageProvider } from '../lib/lofs/providers/file.js';
import { copyAssetsToPublic } from '../lib/content/staticAssetSync.js';

async function main() {
  try {
    const provider = new FileStorageProvider('./content');
    await copyAssetsToPublic(provider);
  } catch (error) {
    console.error('Failed to sync assets:', error);
    process.exit(1);
  }
}

main();
