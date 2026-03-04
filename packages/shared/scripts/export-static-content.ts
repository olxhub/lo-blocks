#!/usr/bin/env node
// packages/shared/scripts/export-static-content.ts
//
// Build script: exports all parsed OLX content as static JSON for static builds.
//
// Usage:
//   npx tsx packages/shared/scripts/export-static-content.ts [--content <dir>] [--manifest <file>] [--out <dir>]
//
// Runs syncContentFromStorage() (same pipeline as the API routes) and writes:
//   - <out>/all.json          Full idMap for content loading
//   - <out>/activities.json   Activity cards for index pages
//   - <out>/manifest.json     Route manifest (copied from content package)
//

import fs from 'fs';
import path from 'path';
import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/lofs/providers/file';
import { getEditPathFromProvenance } from '../lib/lofs/contentPaths';

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const contentDir = path.resolve(getArg('--content', process.env.OLX_CONTENT_DIR || './content'));
const manifestPath = path.resolve(getArg('--manifest', path.join(contentDir, 'static.config.json')));
const outputDir = path.resolve(getArg('--out', 'apps/static/public/static-content'));

function writeJson(filePath: string, data: any) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  ${path.basename(filePath)} (${sizeKB} KB)`);
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

        // Use first variant for metadata
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
  console.log(`Content directory: ${contentDir}`);
  console.log(`Output directory:  ${outputDir}`);

  // Parse content
  const provider = new FileStorageProvider(contentDir, 'content');
  const { idMap, errors } = await syncContentFromStorage(provider);

  const blockCount = Object.keys(idMap).length;
  console.log(`Parsed ${blockCount} blocks`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} parsing error(s):`);
    for (const err of errors) {
      console.error(`  - ${err.message}`);
    }
    console.error('\nAborting: fix parse errors before building static site.');
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Writing:');
  writeJson(path.join(outputDir, 'all.json'), { ok: true, idMap });

  const activities = buildActivities(idMap);
  const activityCount = Object.keys(activities).length;
  console.log(`Found ${activityCount} launchable activities`);
  writeJson(path.join(outputDir, 'activities.json'), { ok: true, activities });

  // Copy manifest if it exists, validating routes against parsed content
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const deadRoutes: string[] = [];
    for (const [urlPath, olxKey] of Object.entries(manifest.routes || {})) {
      if (!idMap[olxKey as string]) {
        deadRoutes.push(`  ${urlPath} → "${olxKey}" (not found in content)`);
      }
    }
    if (deadRoutes.length > 0) {
      console.error(`\nManifest has ${deadRoutes.length} route(s) pointing to missing blocks:`);
      for (const line of deadRoutes) console.error(line);
      console.error('\nAborting: fix manifest routes or add missing content.');
      process.exit(1);
    }
    writeJson(path.join(outputDir, 'manifest.json'), manifest);
    console.log(`Manifest: ${Object.keys(manifest.routes || {}).length} routes`);
  } else {
    // Generate a default manifest from launchable activities
    const routes: Record<string, string> = {};
    const activityIds = Object.keys(activities);
    if (activityIds.length > 0) {
      routes['/'] = activityIds[0];
      for (const id of activityIds) {
        routes[`/${id}`] = id;
      }
    }
    const manifest = { title: 'Static Export', routes };
    writeJson(path.join(outputDir, 'manifest.json'), manifest);
    console.log(`No manifest found at ${manifestPath}, generated default with ${Object.keys(routes).length} routes`);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Static content export failed:', err);
  process.exit(1);
});
