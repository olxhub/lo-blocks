import { test, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_FILE = path.resolve('./xml2json-test-output.json');

// Clean up after test
afterEach(async () => {
  try { await fs.unlink(OUTPUT_FILE); } catch {}
});

test('xml2json script outputs valid JSON', async () => {
  // Run the script with --out flag
  const proc = spawn('npx', ['tsx', 'src/scripts/xml2json.js', '--out', OUTPUT_FILE], {
    stdio: 'ignore', // or 'inherit' to see output
  });

  // Wait for it to finish
  await new Promise((resolve, reject) => {
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error('Script failed')));
    proc.on('error', reject);
  });

  // Read and parse the output file
  const fileContent = await fs.readFile(OUTPUT_FILE, 'utf8');
  let parsed;
  expect(() => { parsed = JSON.parse(fileContent); }).not.toThrow();
  expect(parsed).toHaveProperty('idMap');
});
