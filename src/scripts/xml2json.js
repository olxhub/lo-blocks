#!/usr/bin/env node
// src/scripts/xml2json.js
import stringify from 'json-stable-stringify';

import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/storage';
import fs from 'fs';
import path from 'path';

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

async function main() {
  try {
    const provider = new FileStorageProvider(contentDir);
    const { idMap, errors } = await syncContentFromStorage(provider);

    // Always output the JSON, even if there are errors
    const output = {
      idMap,
      hasErrors: errors && errors.length > 0,
      errorCount: errors ? errors.length : 0
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
    if (errors && errors.length > 0) {
      console.error(`\n⚠️  Found ${errors.length} error(s) during content loading:\n`);

      // Group errors by type for better organization
      const errorsByType = errors.reduce((acc, error) => {
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

      console.error(`❌ Content loading completed with ${errors.length} error(s). Check the errors above.`);
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
