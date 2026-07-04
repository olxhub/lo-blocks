// @vitest-environment node
// packages/shared/scripts/xml2json.test.ts
//
// CLI-level tests: each test spawns the real script under tsx and asserts
// the command-line contract (exit codes, printed errors, output files).
// That's deliberate — it covers argument parsing, process startup, and the
// teacher-facing CLI output that in-process calls would miss (a registry
// initialization-order crash was only visible at this level).
//
// The tests run CONCURRENTLY: each subprocess pays the same tsx+registry
// startup, so serializing them triples the wall time for no isolation
// benefit — they use distinct content dirs and output files.
import { test, expect, afterAll } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Per-test output files (tmp/ is gitignored); shared output would race
// under concurrent execution.
const outputFile = (name: string) => path.resolve(`./tmp/xml2json-test-${name}.json`);
const OUTPUT_FILES = ['default', 'errors', 'singlecourse'].map(outputFile);

afterAll(async () => {
  for (const f of OUTPUT_FILES) {
    try { await fs.unlink(f); } catch {}
  }
});

function runXml2json(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', 'packages/shared/scripts/xml2json.ts', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('exit', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

test.concurrent('xml2json script outputs valid JSON', async () => {
  const out = outputFile('default');
  const { exitCode, stdout, stderr } = await runXml2json(['--out', out]);

  if (exitCode !== 0) {
    console.error('xml2json failed with exit code:', exitCode);
    console.error('stdout:', stdout);
    console.error('stderr:', stderr);
    throw new Error(`Script failed with exit code ${exitCode}`);
  }

  // Read and parse the output file
  const fileContent = await fs.readFile(out, 'utf8');
  let parsed;
  expect(() => { parsed = JSON.parse(fileContent); }).not.toThrow();
  expect(parsed).toHaveProperty('idMap');
  expect(parsed).toHaveProperty('hasErrors');
  expect(parsed).toHaveProperty('errorCount');
}, 60000);

test.concurrent('xml2json error accumulation with PEG errors', async () => {
  const out = outputFile('errors');
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

    const { exitCode, stderr } = await runXml2json(['--content', testContentDir, '--out', out]);

    // Should exit with error code 1 (content errors)
    expect(exitCode).toBe(1);

    // Should output JSON even with errors
    const fileContent = await fs.readFile(out, 'utf8');
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
}, 60000);

test.concurrent('xml2json --ns handles single-course roots with root-level files', async () => {
  // Regression: static builds mount a single course directory directly, so
  // OLX files at its root have no namespace directory and (for manifests
  // without a namespace: field) no manifest to declare one. build-static.ts
  // resolves the namespace itself and passes it via --ns; without --ns the
  // root-level file must surface as an error, not silently disappear.
  const out = outputFile('singlecourse');
  const testContentDir = path.resolve('./test-content-singlecourse');

  try {
    await fs.mkdir(testContentDir, { recursive: true });
    await fs.writeFile(
      path.join(testContentDir, 'course.olx'),
      '<Markdown id="welcome">Hello</Markdown>'
    );

    const baseArgs = ['--content', testContentDir, '--out', out];

    // Without --ns: the root-level file has no resolvable namespace → error
    const without = await runXml2json(baseArgs);
    expect(without.exitCode).toBe(1);
    expect(without.stdout + without.stderr).toMatch(/no namespace|namespace directory/);

    // With --ns: the whole mount is one namespace; keys are qualified
    const withNs = await runXml2json([...baseArgs, '--ns', 'mycourse']);
    expect(withNs.exitCode).toBe(0);
    const parsed = JSON.parse(await fs.readFile(out, 'utf8'));
    expect(parsed.idMap['mycourse/welcome']).toBeDefined();
    expect(parsed.hasErrors).toBe(false);
  } finally {
    try { await fs.rm(testContentDir, { recursive: true, force: true }); } catch {}
  }
}, 60000);
