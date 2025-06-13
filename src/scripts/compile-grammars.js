// src/scripts/compile-grammars.js
// scripts/compile-grammars.js
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import peggy from 'peggy';

const blocksDir = 'src/components/blocks';

async function compileAllPEG() {
  const files = await glob(`${blocksDir}/**/*.pegjs`);

  for (const file of files) {
    const grammar = await fs.readFile(file, 'utf-8');
    const parser = peggy.generate(grammar, { output: 'source', format: 'es' });

    const parsedName = path.basename(file).replace('.pegjs', '');
    const outFile = path.join(path.dirname(file), `_${parsedName}Parser.js`);

    await fs.writeFile(outFile, parser);
    console.log(`✅ Compiled ${file} → ${outFile}`);
  }
}

compileAllPEG().catch(err => {
  console.error('❌ Grammar compilation failed:', err);
  process.exit(1);
});
