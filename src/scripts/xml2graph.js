#!/usr/bin/env node
import stringify from 'json-stable-stringify';
import { loadContentTree } from '../lib/content/loadContentTree';
import { FileStorageProvider } from '../lib/storage';
import { parseIdMap } from '../lib/graph/parseIdMap';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const contentDir = path.resolve('./content');

async function main() {
  try {
    const provider = new FileStorageProvider(contentDir);
    const { idMap } = await loadContentTree(provider);
    const { edges, issues } = parseIdMap(idMap);

    const output = { edges, issues };
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
    console.error('❌ Error creating graph:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

main();
