#!/usr/bin/env node
// packages/shared/scripts/xml2json.ts
//
// Build script: parses OLX content and writes JSON outputs.
//
// Usage:
//   npx tsx packages/shared/scripts/xml2json.ts [flags]
//
// Flags:
//   --content <dir>        Content directory (default: ./content)
//   --ns <namespace>       Treat the whole content directory as ONE namespace
//                          (single-course builds). Without it, namespaces
//                          resolve per file (manifest.yaml, else top-level
//                          directory) — and root-level files are errors.
//   --out <file>           Write idMap JSON to file (default: stdout)
//   --activities <file>    Write activities JSON to file
//   --manifest <file>      Source manifest to validate (default: <contentDir>/static.config.json)
//   --manifest-out <file>  Write validated/generated manifest to file
//   --static-dir <dir>     Shorthand: write all.json + activities.json + manifest.json to <dir>
//
// Default mode (no --static-dir): Parses content, runs graph validation, writes
// { idMap, hasErrors, errorCount }. Continues on content errors (exit 1).
//
// Static export mode (--static-dir): Writes all.json, activities.json, manifest.json.
// Aborts on content errors (can't build a working site from broken content).

import stringify from 'json-stable-stringify';
import fs from 'fs';
import path from 'path';

import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { buildActivityCards } from '../lib/catalog/buildActivityCards';
import { FileStorageProvider } from '../lib/storage/lofs/providers/file';
import { registerAllowedContentDir } from '../lib/storage/lofs/allowedDirs';
import { parseContentNamespace } from '../lib/types/id-grammar';
import type { ContentNamespace } from '../lib/types/id-grammar';

// Optional: Include graph validation to catch component registration issues
// This can be safely removed if graph parsing is not needed or changes significantly
const INCLUDE_GRAPH_VALIDATION = true;

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
function getArgOptional(flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const contentDir = path.resolve(getArg('--content', './content'));
registerAllowedContentDir(contentDir);  // allow reads/writes under the chosen dir
// Single-namespace override for single-course builds (see flag docs above).
// parseContentNamespace fails fast with the grammar's message on bad input.
const nsArg = getArgOptional('--ns');
const ns: ContentNamespace | undefined = nsArg ? parseContentNamespace(nsArg) : undefined;
const staticDir = getArgOptional('--static-dir');
const outFile = getArgOptional('--out') || (staticDir ? path.join(staticDir, 'all.json') : null);
const activitiesFile = getArgOptional('--activities') || (staticDir ? path.join(staticDir, 'activities.json') : null);
const manifestSource = path.resolve(getArg('--manifest', path.join(contentDir, 'static.config.json')));
const manifestOutFile = getArgOptional('--manifest-out') || (staticDir ? path.join(staticDir, 'manifest.json') : null);
const isStaticMode = !!staticDir;

function formatErrorForConsole(error: any): string {
  let output = `❌ ${error.type.toUpperCase()}: ${error.message}`;

  if (error.location) {
    const { line, column, offset, provenance } = error.location;
    if (provenance && provenance.length > 0) {
      // Producers should narrow provenance to the actually-offending
      // source(s); passing all related sources is the default.
      output += `\n   📁 Source: ${provenance.join('\n      ')}`;
    }
    if (line || column) {
      output += `\n   📍 Location: Line ${line || '?'}, Column ${column || '?'}`;
      if (offset) output += ` (offset ${offset})`;
    }
  }

  if (error.technical) {
    // TODO: Make this generic. We don't want error handling to have
    // special cases for types.
    if (error.type === 'peg_error') {
      if (error.technical.originalTag) {
        let blockInfo = `<${error.technical.originalTag}>`;
        if (error.technical.originalId) {
          blockInfo += ` id="${error.technical.originalId}"`;
        }
        output += `\n   🏷️  Block: ${blockInfo}`;
      }
      if (error.technical.expected) {
        output += `\n   🔍 Expected: ${error.technical.expected.map((e: any) => `"${e.description || e}"`).join(', ')}`;
        if (error.technical.found !== null) {
          output += `\n   🔍 Found: "${error.technical.found}"`;
        }
      }
    }
  }

  return output;
}

function printFormattedErrors(errors: any[]) {
  if (!errors || errors.length === 0) return;

  console.error(`\n⚠️  Found ${errors.length} error(s) during content loading:\n`);

  // Group errors by type for better organization
  const errorsByType: Record<string, any[]> = {};
  for (const error of errors) {
    if (!errorsByType[error.type]) errorsByType[error.type] = [];
    errorsByType[error.type].push(error);
  }

  for (const [type, typeErrors] of Object.entries(errorsByType)) {
    console.error(`📋 ${type.toUpperCase()} (${typeErrors.length}):`);
    typeErrors.forEach((error, index) => {
      console.error(`\n${index + 1}. ${formatErrorForConsole(error)}`);
    });
    console.error(''); // Empty line between types
  }

  console.error(`❌ Content loading completed with ${errors.length} error(s). Check the errors above.`);
}

function writeJson(filePath: string, data: any) {
  const json = stringify(data, { space: 2 }) || '{}';
  fs.writeFileSync(filePath, json);
  const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`  ${path.basename(filePath)} (${sizeKB} KB)`);
}

/**
 * Adds component registration validation by running graph parsing.
 * This catches missing components that would cause runtime failures.
 */
async function addGraphValidationErrors(idMap: any, parseErrors: any[]) {
  if (!INCLUDE_GRAPH_VALIDATION) {
    return parseErrors || [];
  }

  try {
    const { parseIdMap } = await import('../lib/graph/parseIdMap');
    const { issues: graphIssues } = parseIdMap(idMap);

    const graphErrors = (graphIssues || []).map((issue: any) => ({
      type: 'component_error',
      message: issue.message,
      technical: issue
    }));

    return [...(parseErrors || []), ...graphErrors];
  } catch (error: any) {
    console.warn('Graph validation failed, continuing without it:', error.message);
    return parseErrors || [];
  }
}

/**
 * Validate manifest routes against parsed content, write manifest to output.
 * If no manifest source exists, generate a default from launchable activities.
 */
function writeManifest(idMap: any, activities: Record<string, any>) {
  if (!manifestOutFile) return;

  if (fs.existsSync(manifestSource)) {
    const manifest = JSON.parse(fs.readFileSync(manifestSource, 'utf-8'));
    const deadRoutes: string[] = [];
    for (const [urlPath, definitionKey] of Object.entries(manifest.routes || {})) {
      if (!idMap[definitionKey as string]) {
        deadRoutes.push(`  ${urlPath} → "${definitionKey}" (not found in content)`);
      }
    }
    if (deadRoutes.length > 0) {
      console.error(`\nManifest has ${deadRoutes.length} route(s) pointing to missing blocks:`);
      for (const line of deadRoutes) console.error(line);
      console.error('\nAborting: fix manifest routes or add missing content.');
      process.exit(1);
    }
    writeJson(manifestOutFile, manifest);
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
    writeJson(manifestOutFile, manifest);
    console.log(`No manifest found at ${manifestSource}, generated default with ${Object.keys(routes).length} routes`);
  }
}

async function main() {
  try {
    console.log(`Content directory: ${contentDir}`);
    if (ns) console.log(`Namespace: ${ns} (--ns override)`);
    const provider = new FileStorageProvider(contentDir, 'content', { ns });
    const { idMap, errors: parseErrors } = await syncContentFromStorage(provider);

    const blockCount = Object.keys(idMap).length;
    console.log(`Parsed ${blockCount} blocks`);

    // In static mode, abort on content errors (can't build a working site)
    if (isStaticMode && parseErrors.length > 0) {
      printFormattedErrors(parseErrors);
      console.error('\nAborting: fix parse errors before building static site.');
      process.exit(1);
    }

    // Graph validation only in default mode
    const allErrors = isStaticMode
      ? parseErrors
      : await addGraphValidationErrors(idMap, parseErrors);

    // Write idMap output
    if (outFile) {
      const outputDir = path.dirname(outFile);
      fs.mkdirSync(outputDir, { recursive: true });
      const data = isStaticMode
        ? { ok: true, idMap }
        : { idMap, hasErrors: allErrors.length > 0, errorCount: allErrors.length };
      console.log('Writing:');
      writeJson(outFile, data);
    } else {
      // Default: stdout
      const output = { idMap, hasErrors: allErrors.length > 0, errorCount: allErrors.length };
      console.log(stringify(output, { space: 2 }));
    }

    // Write activities if requested
    if (activitiesFile) {
      const { cards: activities, warnings } = buildActivityCards(idMap);
      if (warnings.length) {
        console.warn(`${warnings.length} launchable warning(s):`);
        for (const w of warnings) console.warn(`  ${w.message}`);
      }
      const activityCount = Object.keys(activities).length;
      console.log(`Found ${activityCount} launchable activities`);
      writeJson(activitiesFile, { ok: true, activities });

      // Write manifest (needs activities for default generation)
      writeManifest(idMap, activities);
    } else if (manifestOutFile) {
      // Manifest requested without activities — build activities for default generation
      const { cards: activities } = buildActivityCards(idMap);
      writeManifest(idMap, activities);
    }

    // Print errors to stderr
    if (allErrors.length > 0) {
      printFormattedErrors(allErrors);
      process.exit(1);
    } else {
      console.error('✅ Content loading completed successfully with no errors.');
      process.exit(0);
    }
  } catch (fatalErr: any) {
    // Catastrophic failure - couldn't even attempt parsing
    console.error('💥 Fatal error during content loading:', fatalErr.message);
    console.error('Full error:', fatalErr);
    process.exit(2); // Different exit code for fatal errors
  }
}

main();
