// src/scripts/export-static-content.ts
//
// Build script: exports all parsed OLX content as static JSON for static builds.
//
// Usage: npx tsx src/scripts/export-static-content.ts
//
// Runs syncContentFromStorage() (same pipeline as the API routes) and writes:
//   - public/static-content/all.json     (full idMap for content loading)
//   - public/static-content/activities.json (activity cards for home page)
//
// Images are copied to public/content/ automatically by syncContentFromStorage().
//

import fs from 'fs';
import path from 'path';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getEditPathFromProvenance } from '@/lib/lofs/contentPaths';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'static-content');

function writeJson(filename: string, data: any) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  ${filename} (${sizeKB} KB)`);
}

/**
 * Build activity cards from the idMap, mirroring /api/activities logic.
 */
function buildActivities(idMap: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(idMap)
      .filter(([_, variantMap]: [string, any]) => {
        return Object.values(variantMap).some((olxJson: any) =>
          olxJson.attributes?.launchable === 'true'
        );
      })
      .map(([id, variantMap]: [string, any]) => {
        const availableVariants = Object.keys(variantMap);

        const title: Record<string, string> = {};
        const description: Record<string, string> = {};
        const availableVariantsMap: Record<string, string> = {};

        for (const variant of availableVariants) {
          const olxJson = variantMap[variant];
          if (olxJson.attributes?.launchable === 'true') {
            title[variant] = olxJson.attributes?.title || id;
            description[variant] = olxJson.description || '';
            availableVariantsMap[variant] = olxJson.generated ? 'bestEffort' : 'supported';
          }
        }

        // Use first variant as fallback for metadata
        const firstVariant = availableVariants[0];
        const entry = variantMap[firstVariant];
        const editPathResult = getEditPathFromProvenance(entry.provenance);
        const editPath = editPathResult.valid ? editPathResult.relativePath : null;

        return [
          id,
          {
            id,
            category: entry.category || 'other',
            index: entry.index,
            tag: entry.tag,
            editPath,
            title,
            description,
            availableVariants: availableVariantsMap,
            provenance: entry.provenance
          }
        ];
      })
  );
}

async function main() {
  console.log('Exporting static content...');

  const { idMap, errors } = await syncContentFromStorage();

  if (errors.length > 0) {
    console.warn(`${errors.length} parsing error(s):`);
    for (const err of errors) {
      console.warn(`  - ${err.message}`);
    }
  }

  const blockCount = Object.keys(idMap).length;
  console.log(`Parsed ${blockCount} blocks`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Writing:');
  writeJson('all.json', { ok: true, idMap });

  const activities = buildActivities(idMap);
  const activityCount = Object.keys(activities).length;
  console.log(`Found ${activityCount} launchable activities`);
  writeJson('activities.json', { ok: true, activities });
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Static content export failed:', err);
  process.exit(1);
});
