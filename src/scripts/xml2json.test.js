// src/scripts/xml2json.test.js
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
  expect(parsed).toHaveProperty('hasErrors');
  expect(parsed).toHaveProperty('errorCount');
}, 30000);

test('xml2json error accumulation with PEG errors', async () => {
  const testContentDir = path.resolve('./test-content-errors');

  try {
    // Create test content directory and files
    await fs.mkdir(testContentDir, { recursive: true });

    // Copy our test error files from test data directory
    await fs.copyFile(
      path.resolve('./src/scripts/xml2json-testdata/test_error.xml'),
      path.join(testContentDir, 'test_error.xml')
    );
    await fs.copyFile(
      path.resolve('./src/scripts/xml2json-testdata/broken.chatpeg'),
      path.join(testContentDir, 'broken.chatpeg')
    );

    // Run xml2json with test content directory
    const proc = spawn('npx', ['tsx', 'src/scripts/xml2json.js', '--out', OUTPUT_FILE], {
      env: { ...process.env, OLX_CONTENT_DIR: testContentDir },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    // Wait for completion
    const exitCode = await new Promise((resolve) => {
      proc.on('exit', resolve);
    });

    // Should exit with error code 1 (content errors)
    expect(exitCode).toBe(1);

    // Should output JSON even with errors
    const fileContent = await fs.readFile(OUTPUT_FILE, 'utf8');
    const parsed = JSON.parse(fileContent);
    expect(parsed.hasErrors).toBe(true);
    expect(parsed.errorCount).toBeGreaterThan(0);

    // Should output formatted errors to stderr
    expect(stderr).toContain('⚠️  Found');
    expect(stderr).toContain('error(s) during content loading');
    expect(stderr).toContain('PEG_ERROR');
    expect(stderr).toContain('Expected [a-zA-Z0-9 _\\-]');

  } finally {
    // Clean up
    try {
      await fs.rm(testContentDir, { recursive: true, force: true });
    } catch {}
  }
}, 30000);
