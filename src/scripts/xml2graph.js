#!/usr/bin/env node
// src/scripts/xml2graph.js
import stringify from 'json-stable-stringify';
import { syncContentFromStorage } from '../lib/content/syncContentFromStorage';
import { FileStorageProvider } from '../lib/lofs/providers/file';
import { parseIdMap } from '../lib/graph/parseIdMap';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const contentDir = path.resolve('./content');

// TODO: profile / understand speed.
//
// real	0m4.349s
// user	0m5.535s
// sys	0m0.984s
//
// This should be pretty instant!

async function main() {
  try {
    const provider = new FileStorageProvider(contentDir);
    const { idMap } = await syncContentFromStorage(provider);

    const rawOutput = parseIdMap(idMap);
    const pretty = stringify(rawOutput, { space: 2 });

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
    console.error('❌ Error creating graph:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

main();
