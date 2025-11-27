#!/usr/bin/env node
// src/scripts/xml2json.js
import stringify from 'json-stable-stringify';

import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/storage/providers/file';
import fs from 'fs';
import path from 'path';

// Optional: Include graph validation to catch component registration issues
// This can be safely removed if graph parsing is not needed or changes significantly
const INCLUDE_GRAPH_VALIDATION = true;

const args = process.argv.slice(2);
const contentDir = path.resolve(process.env.OLX_CONTENT_DIR || './content');

function formatErrorForConsole(error) {
  let output = `❌ ${error.type.toUpperCase()}: ${error.message}`;

  if (error.file) {
    output += `\n   📁 File: ${error.file}`;
  }

  if (error.location) {
    const { line, column, offset } = error.location;
    if (line || column) {
      output += `\n   📍 Location: Line ${line || '?'}, Column ${column || '?'}`;
      if (offset) output += ` (offset ${offset})`;
    }
  }

  if (error.technical) {
    // TODO: Make this generic. We don't want error handling to have
    // special cases for types.
    if (error.type === 'peg_error' && error.technical.expected) {
      output += `\n   🔍 Expected: ${error.technical.expected.map(e => `"${e.description || e}"`).join(', ')}`;
      if (error.technical.found !== null) {
        output += `\n   🔍 Found: "${error.technical.found}"`;
      }
    }
  }

  return output;
}

/**
 * Adds component registration validation by running graph parsing
 * This catches missing components that would cause runtime failures
 * Can be safely removed by setting INCLUDE_GRAPH_VALIDATION = false
 * (or removing the code, if we ever change or remove the graph
 * renderer).
 *
 * This is very optional, but a nice-to-have.
 */
async function addGraphValidationErrors(idMap, parseErrors) {
  if (!INCLUDE_GRAPH_VALIDATION) {
    return parseErrors || [];
  }

  try {
    const { parseIdMap } = await import('../lib/graph/parseIdMap');
    const { issues: graphIssues } = parseIdMap(idMap);

    const graphErrors = (graphIssues || []).map(issue => ({
      type: 'component_error',
      message: issue.message,
      technical: issue
    }));

    return [...(parseErrors || []), ...graphErrors];
  } catch (error) {
    console.warn('Graph validation failed, continuing without it:', error.message);
    return parseErrors || [];
  }
}

async function main() {
  try {
    const provider = new FileStorageProvider(contentDir);
    const { idMap, errors: parseErrors } = await syncContentFromStorage(provider);

    // Add optional graph validation errors
    const allErrors = await addGraphValidationErrors(idMap, parseErrors);

    // Always output the JSON, even if there are errors
    const output = {
      idMap,
      hasErrors: allErrors && allErrors.length > 0,
      errorCount: allErrors ? allErrors.length : 0
    };

    const pretty = stringify(output, { space: 2 });

    // Output JSON to stdout
    if (args.includes('--out')) {
      const outIndex = args.indexOf('--out');
      const outFile = args[outIndex + 1];
      fs.writeFileSync(outFile, pretty);
      console.log(`✅ Output written to ${outFile}`);
    } else {
      console.log(pretty);
    }

    // Print errors to stderr if any exist
    if (allErrors && allErrors.length > 0) {
      console.error(`\n⚠️  Found ${allErrors.length} error(s) during content loading:\n`);

      // Group errors by type for better organization
      const errorsByType = allErrors.reduce((acc, error) => {
        if (!acc[error.type]) acc[error.type] = [];
        acc[error.type].push(error);
        return acc;
      }, {});

      // Output errors by type
      for (const [type, typeErrors] of Object.entries(errorsByType)) {
        console.error(`📋 ${type.toUpperCase()} (${typeErrors.length}):`);
        typeErrors.forEach((error, index) => {
          console.error(`\n${index + 1}. ${formatErrorForConsole(error)}`);
        });
        console.error(''); // Empty line between types
      }

      console.error(`❌ Content loading completed with ${allErrors.length} error(s). Check the errors above.`);
      process.exit(1); // Exit with error code
    } else {
      console.error('✅ Content loading completed successfully with no errors.');
      process.exit(0);
    }
  } catch (fatalErr) {
    // Catastrophic failure - couldn't even attempt parsing
    console.error('💥 Fatal error during content loading:', fatalErr.message);
    console.error('Full error:', fatalErr);
    process.exit(2); // Different exit code for fatal errors
  }
}

main();
