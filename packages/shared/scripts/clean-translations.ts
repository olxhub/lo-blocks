#!/usr/bin/env node
// packages/shared/scripts/clean-translations.ts
//
// Remove all machine-translated files from the content directory.
//
// Loads the content store, finds every variant with generated.method === 'machineTranslated',
// resolves its source file via the content store's provenance lookup,
// and deletes via the storage provider (which enforces path safety).
//
// Usage:
//   npm run clean-translations                        # dry run (default)
//   npm run clean-translations -- --rm                # actually delete files
//   npm run clean-translations -- --content <dir>     # custom content dir

import { syncContentFromStorage, getSourceFile } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/lofs/providers/file';
import { registerAllowedContentDir } from '../lib/lofs/allowedDirs';
import { variantMapEntries } from '../lib/types/i18n';
import path from 'path';
import type { IdMap, DefinitionKey, LofsRef } from '../lib/types';

const argv = process.argv.slice(2);
const contentArg = argv.indexOf('--content');
const contentDir = path.resolve(contentArg >= 0 && argv[contentArg + 1] ? argv[contentArg + 1] : './content');
registerAllowedContentDir(contentDir);  // allow reads/deletes under the chosen dir
const dryRun = !argv.includes('--rm');

async function main() {
  const provider = new FileStorageProvider(contentDir, 'content');
  const { idMap } = await syncContentFromStorage(provider);

  // Collect provenance URIs of machine-translated files
  const filesToDelete = new Set<LofsRef>();

  for (const [blockId, variantMap] of Object.entries(idMap) as [DefinitionKey, IdMap[DefinitionKey]][]) {
    for (const [variant, olxJson] of variantMapEntries(variantMap)) {
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
    const relPath = provider.toRelativePath(fileUri);
    console.log(`  ${label}: ${relPath}`);
    if (!dryRun) {
      await provider.commit([{ path: relPath, delete: true }]);
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
