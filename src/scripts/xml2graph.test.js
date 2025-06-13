// src/scripts/xml2graph.test.js
import { test, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_FILE = path.resolve('./xml2graph-test-output.json');

// Clean up after test
afterEach(async () => {
  try { await fs.unlink(OUTPUT_FILE); } catch {}
});

test('xml2graph script outputs edges and issues', async () => {
  const proc = spawn('npx', ['tsx', 'src/scripts/xml2graph.js', '--out', OUTPUT_FILE], {
    stdio: 'ignore',
  });

  await new Promise((resolve, reject) => {
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error('Script failed')));
    proc.on('error', reject);
  });

  const fileContent = await fs.readFile(OUTPUT_FILE, 'utf8');
  let parsed;
  expect(() => { parsed = JSON.parse(fileContent); }).not.toThrow();
  expect(parsed).toHaveProperty('edges');
  expect(Array.isArray(parsed.edges)).toBe(true);
  expect(parsed).toHaveProperty('issues');
});
