// @vitest-environment node
// packages/shared/scripts/xml2json.test.ts
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
  const proc = spawn('npx', ['tsx', 'packages/shared/scripts/xml2json.ts', '--out', OUTPUT_FILE], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (data) => { stdout += data.toString(); });
  proc.stderr.on('data', (data) => { stderr += data.toString(); });

  // Wait for it to finish
  const exitCode = await new Promise((resolve) => {
    proc.on('exit', resolve);
  });

  if (exitCode !== 0) {
    console.error('xml2json failed with exit code:', exitCode);
    console.error('stdout:', stdout);
    console.error('stderr:', stderr);
    throw new Error(`Script failed with exit code ${exitCode}`);
  }

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
    // Create test content directory and files. Files go in a namespace
    // directory (testns/) — the top-level directory is the content namespace.
    const nsDir = path.join(testContentDir, 'testns');
    await fs.mkdir(nsDir, { recursive: true });

    // Copy our test error files from test data directory
    await fs.copyFile(
      path.resolve('./packages/shared/scripts/xml2json-testdata/test_error.xml'),
      path.join(nsDir, 'test_error.xml')
    );
    await fs.copyFile(
      path.resolve('./packages/shared/scripts/xml2json-testdata/broken.chatpeg'),
      path.join(nsDir, 'broken.chatpeg')
    );

    // Run xml2json with test content directory
    const proc = spawn('npx', ['tsx', 'packages/shared/scripts/xml2json.ts', '--content', testContentDir, '--out', OUTPUT_FILE], {
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

test('xml2json --ns handles single-course roots with root-level files', async () => {
  // Regression: static builds mount a single course directory directly, so
  // OLX files at its root have no namespace directory and (for manifests
  // without a namespace: field) no manifest to declare one. build-static.ts
  // resolves the namespace itself and passes it via --ns; without --ns the
  // root-level file must surface as an error, not silently disappear.
  const testContentDir = path.resolve('./test-content-singlecourse');

  try {
    await fs.mkdir(testContentDir, { recursive: true });
    await fs.writeFile(
      path.join(testContentDir, 'course.olx'),
      '<Markdown id="welcome">Hello</Markdown>'
    );

    const runXml2json = (extraArgs: string[]) => new Promise<{ exitCode: number; output: string }>((resolve) => {
      const proc = spawn('npx', [
        'tsx', 'packages/shared/scripts/xml2json.ts',
        '--content', testContentDir,
        '--out', OUTPUT_FILE,
        ...extraArgs,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      proc.stdout.on('data', d => { output += d.toString(); });
      proc.stderr.on('data', d => { output += d.toString(); });
      proc.on('exit', (exitCode) => resolve({ exitCode: exitCode ?? 1, output }));
    });

    // Without --ns: the root-level file has no resolvable namespace → error
    const without = await runXml2json([]);
    expect(without.exitCode).toBe(1);
    expect(without.output).toMatch(/no namespace|namespace directory/);

    // With --ns: the whole mount is one namespace; keys are qualified
    const withNs = await runXml2json(['--ns', 'mycourse']);
    expect(withNs.exitCode).toBe(0);
    const parsed = JSON.parse(await fs.readFile(OUTPUT_FILE, 'utf8'));
    expect(parsed.idMap['mycourse/welcome']).toBeDefined();
    expect(parsed.hasErrors).toBe(false);
  } finally {
    try { await fs.rm(testContentDir, { recursive: true, force: true }); } catch {}
  }
}, 60000);
