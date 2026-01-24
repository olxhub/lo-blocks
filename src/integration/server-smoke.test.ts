// @vitest-environment node
// src/integration/server-smoke.test.js
/*
 * Basic smoke test: Does the server start and serve pages without 500
 * errors.
 *
 * Uses a separate .next-test directory to avoid conflicting with user's
 * dev server (Next.js 14+ uses a directory-level lock file).
 */
import { test, expect } from 'vitest';
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import getPort from 'get-port';

// Use separate build directory so tests don't conflict with dev server
const TEST_DIST_DIR = '.next-test';

/**
 * Clean up test build directory before/after test.
 */
function cleanupTestDir() {
  const testDir = join(process.cwd(), TEST_DIST_DIR);
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // May not exist, that's fine
  }
}

// Combined test: server startup, page serving, and graceful shutdown
test('Next.js server basic endpoints work', async () => {
  // Clean up any previous test build directory
  cleanupTestDir();

  const port = await getPort();
  let proc, res, shutdownRes;

  try {
    proc = spawn('npx', ['next', 'dev', '-p', port, '--turbo'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_DIST_DIR: TEST_DIST_DIR,  // Use separate build dir to avoid lock conflicts
      },
      stdio: 'inherit',
      detached: true,
    });

    // Test that server starts and serves pages
    res = await waitForServer(`http://localhost:${port}/`);
    expect(res).toBeDefined();
    expect(res.status).toBeLessThan(500);

    // Fetch file tree
    const treeRes = await fetch(`http://localhost:${port}/api/files`);
    expect(treeRes.status).toBe(200);

    const tree = await treeRes.json();
    expect(tree.ok).toBe(true);

    // Fetch single file
    const fileRes = await fetch(
      `http://localhost:${port}/api/file?path=${encodeURIComponent('content/demos/text-changer-demo.olx')}`
    );
    expect(fileRes.status).toBe(200);
    const fileJson = await fileRes.json();
    expect(fileJson.ok).toBe(true);

    // Test graceful shutdown via API
    shutdownRes = await fetch(`http://localhost:${port}/api/admin/shutdown`, {
      signal: AbortSignal.timeout(3000)
    });
    expect(shutdownRes.status).toBe(200);

    const shutdownData = await shutdownRes.json();
    expect(shutdownData.message).toBe('Shutting down server...');

  } finally {
    // Fallback: force kill if graceful shutdown failed
    if (proc && proc.pid && !proc.killed) {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        // Process already dead, ignore
      }
    }
    // Clean up test build directory
    cleanupTestDir();
  }
}, 60000);

async function waitForServer(url, { timeout = 20000, interval = 2000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.status < 600) return res;
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Server did not start at ${url} within ${timeout}ms`);
}
