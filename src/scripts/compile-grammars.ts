// src/scripts/compile-grammars.js
// scripts/compile-grammars.js
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import peggy from 'peggy';

const blocksDir = 'src/components/blocks';
const templateDir = 'src/lib/template';
const stateLanguageDir = 'src/lib/stateLanguage';

async function compileAllPEG() {
  const files = [
    ...(await glob(`${blocksDir}/**/*.pegjs`)),
    ...(await glob(`${templateDir}/**/*.pegjs`)),
    ...(await glob(`${stateLanguageDir}/**/*.pegjs`))
  ];

  const extensions: string[] = [];

  for (const file of files) {
    const grammar = await fs.readFile(file, 'utf-8');

    const parsedName = path.basename(file).replace('.pegjs', '');

    // Special handling for grammars with multiple entry points
    const options = {
      output: 'source' as const,
      format: 'es' as const,
      allowedStartRules: parsedName === 'expand'
        ? ['Condition', 'Template', 'FormatTemplate']
        : undefined,
    };

    const parserSource = peggy.generate(grammar, options) as string;

    const outFile = path.join(
      path.dirname(file),
      `_${parsedName}Parser.js`
    );

    await fs.writeFile(outFile, parserSource);
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
