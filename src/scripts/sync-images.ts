#!/usr/bin/env tsx
/**
 * Sync images from content directory to public folder for Next.js static serving
 */

import { FileStorageProvider } from '../lib/lofs/providers/file.js';
import { copyImagesToPublic } from '../lib/content/imageSync.js';

async function main() {
  try {
    const provider = new FileStorageProvider('./content');
    await copyImagesToPublic(provider);
  } catch (error) {
    console.error('❌ Failed to sync images:', error);
    process.exit(1);
  }
}

main();
