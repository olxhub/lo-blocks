// src/scripts/compile-grammars.js
// scripts/compile-grammars.js
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import peggy from 'peggy';

const blocksDir = 'src/components/blocks';
const templateDir = 'src/lib/template';

async function compileAllPEG() {
  const files = [
    ...(await glob(`${blocksDir}/**/*.pegjs`)),
    ...(await glob(`${templateDir}/**/*.pegjs`))
  ];

  const extensions = [];

  for (const file of files) {
    const grammar = await fs.readFile(file, 'utf-8');
    const parser = peggy.generate(grammar, { output: 'source', format: 'es' });

    const parsedName = path.basename(file).replace('.pegjs', '');
    const isTemplate = file.startsWith(`${templateDir}${path.sep}`);
    const outFile = path.join(
      path.dirname(file),
      isTemplate ? `${parsedName}Parser.js` : `_${parsedName}Parser.js`
    );

    await fs.writeFile(outFile, parser);
    console.log(`✅ Compiled ${file} → ${outFile}`);

    extensions.push(`${parsedName}peg`);
  }

  const extFile = path.resolve('src/generated/pegExtensions.json');
  await fs.mkdir(path.dirname(extFile), { recursive: true });
  await fs.writeFile(extFile, JSON.stringify(extensions, null, 2));
  console.log(`✅ Wrote ${extFile}`);
}

compileAllPEG().catch(err => {
  console.error('❌ Grammar compilation failed:', err);
  process.exit(1);
});
