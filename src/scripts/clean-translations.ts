#!/usr/bin/env node
// src/scripts/clean-translations.ts
//
// Remove all machine-translated files from the content directory.
//
// Loads the content store, finds every variant with generated.method === 'machineTranslated',
// resolves its source file via the content store's provenance lookup,
// and deletes via the storage provider (which enforces path safety).
//
// Usage:
//   npm run clean-translations          # dry run (default)
//   npm run clean-translations -- --rm  # actually delete files

import { syncContentFromStorage, getSourceFile } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/lofs/providers/file';
import { toOlxRelativePath } from '../lib/lofs/types';
import path from 'path';
import type { IdMap, OlxJson, OlxKey, ContentVariant } from '../lib/types';

const contentDir = path.resolve(process.env.OLX_CONTENT_DIR || './content');
const dryRun = !process.argv.includes('--rm');

async function main() {
  const provider = new FileStorageProvider(contentDir);
  const { idMap } = await syncContentFromStorage(provider);

  // Collect provenance URIs of machine-translated files
  const filesToDelete = new Set<string>();

  for (const [blockId, variantMap] of Object.entries(idMap) as [OlxKey, IdMap[OlxKey]][]) {
    for (const [variant, olxJson] of Object.entries(variantMap) as [ContentVariant, OlxJson][]) {
      if (olxJson.generated?.method !== 'machineTranslated') continue;

      const fileUri = getSourceFile(blockId, variant);
      if (!fileUri) {
        console.error(`WARNING: translated variant ${blockId}/${variant} has no source file in content store`);
        continue;
      }
      filesToDelete.add(fileUri);
    }
  }

  if (filesToDelete.size === 0) {
    console.log('No machine-translated files found.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n==== Dry run ====\n');
  }

  const label = dryRun ? 'would delete' : 'deleting';
  for (const fileUri of filesToDelete) {
    console.log(`  ${label}: ${provider.toRelativePath(fileUri)}`);
    if (!dryRun) {
      const relPath = toOlxRelativePath(provider.toRelativePath(fileUri), 'clean-translations');
      await provider.delete(relPath);
    }
  }

  if (dryRun) {
    console.log(`\nTo delete these ${filesToDelete.size} file(s), run:\n`);
    console.log('  npm run clean-translations -- --rm\n');
  } else {
    console.log(`\nDeleted ${filesToDelete.size} file(s).\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
