/*
 * Basic smoke test: Does the server start and serve pages without 500
 * errors.
 */

import { test, expect } from 'vitest';
import { spawn } from 'child_process';
import getPort from 'get-port';

test('Next.js server root does not 500', async () => {
  const port = await getPort();
  const proc = spawn('npx', ['next', 'dev', '-p', port, '--turbo'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit', // see output in case of error
  });

  let res;
  try {
    // Wait for the server to be ready and respond
    res = await waitForServer(`http://localhost:${port}/`);
  } finally {
    proc.kill();
  }

  expect(res).toBeDefined();
  expect(res.status).toBeLessThan(500);
}, 30000); // generous timeout

// --- helper goes here:
async function waitForServer(url, { timeout = 20000, interval = 200 } = {}) {
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
