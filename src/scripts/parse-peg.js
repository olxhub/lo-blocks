#!/usr/bin/env node
// src/scripts/parse-peg.js
import { promises as fs } from 'fs';
import path from 'path';
import stringify from 'json-stable-stringify';
import { glob } from 'glob';

async function loadParser(extension) {
  const clean = extension.replace(/^\./, '');
  const grammarName = clean.replace(/peg$/, '');
  const pattern = path.resolve('src/components/blocks', `**/_${grammarName}Parser.js`);
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
