#!/usr/bin/env node
// src/scripts/parse-chatpeg.js
import { promises as fs } from 'fs';
import path from 'path';
import stringify from 'json-stable-stringify';
import * as parser from '../components/blocks/Chat/_chatParser.js';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: parse-chatpeg.js <file>');
    process.exit(1);
  }
  try {
    const content = await fs.readFile(path.resolve(file), 'utf-8');
    const parsed = parser.parse(content);
    console.log(stringify(parsed, { space: 2 }));
  } catch (err) {
    console.error('Failed to parse', file);
    console.error(err.message);
    process.exit(1);
  }
}

main();
