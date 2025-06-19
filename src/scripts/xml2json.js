#!/usr/bin/env node
// src/scripts/xml2json.js
import stringify from 'json-stable-stringify';

import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/storage';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const contentDir = path.resolve('./content');

async function main() {
  try {
    const provider = new FileStorageProvider(contentDir);
    const { idMap } = await syncContentFromStorage(provider);

    const output = {
      idMap
    };

    const pretty = stringify(output, { space: 2 });

    if (args.includes('--out')) {
      const outIndex = args.indexOf('--out');
      const outFile = args[outIndex + 1];
      fs.writeFileSync(outFile, pretty);
      console.log(`✅ Output written to ${outFile}`);
      process.exit(0);
    } else {
      console.log(pretty);
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Error compiling XML:', err.message);
    console.error("Full error: ", err);
    process.exit(1);
  }
}

main();
