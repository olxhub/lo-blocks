#!/usr/bin/env node
// packages/shared/scripts/parse-peg.ts
//
// Dump what a PEG grammar makes of a file, as JSON. An authoring aid: the
// extension picks the parser, so `foo.matchingpeg` is parsed by the compiled
// _matchingParser.js, `foo.sortpeg` by _sortParser.js, and so on for every
// grammar under components/blocks.
//
//   npm run parse-peg -- packages/shared/components/blocks/input/Matching/\
//       matching.pegjs.preview.matchingpeg
//
// REQUIRES `npm run build:grammars` FIRST. The _*Parser.js files it loads are
// build products and are gitignored, so on a fresh checkout there is nothing to
// resolve and every extension reports "No parser found".
//
// NO TEST, deliberately, and this is the reason rather than an oversight: any
// test would load those same gitignored artifacts, so it would pass or fail on
// whether the grammars had been built and not on whether this script works.
// A test that reports the state of the build under the name of the script is
// worse than none. (Contrast scripts/olx_string_idmaps.test.ts, which parses
// from source and so tests what it claims to.)
import { promises as fs } from 'fs';
import path from 'path';
import stringify from 'json-stable-stringify';
import { glob } from 'glob';

async function loadParser(extension) {
  const clean = extension.replace(/^\./, '');
  const grammarName = clean.replace(/peg$/, '');
  const pattern = path.resolve('packages/shared/components/blocks', `**/_${grammarName}Parser.js`);
  const [parserFile] = await glob(pattern);
  if (!parserFile) {
    throw new Error(`No parser found for extension: ${extension}`);
  }
  return import(parserFile);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: parse-peg.js <file>');
    process.exit(1);
  }
  try {
    const content = await fs.readFile(path.resolve(file), 'utf-8');
    const ext = path.extname(file).slice(1);
    const parserModule = await loadParser(ext);
    const parsed = parserModule.parse(content);
    console.log(stringify(parsed, { space: 2 }));
  } catch (err) {
    console.error('Failed to parse', file);
    console.error(err.message);
    process.exit(1);
  }
}

main();
