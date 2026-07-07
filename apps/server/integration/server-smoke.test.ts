// @vitest-environment node
// apps/server/integration/server-smoke.test.ts
/*
 * Smoke test for the app server (Hono on :8888 in dev) — the system's
 * master entry point: does it boot, serve the catalog SPA through the Vite
 * dev middleware, and answer its own API routes without 500s.
 *

 * Spawned as a real subprocess (like the xml2json CLI tests): startup
 * ordering, config loading, and content sync are part of what breaks.
 */
import { test, expect } from 'vitest';
import { spawn } from 'child_process';
import getPort from 'get-port';

/** Poll until the server answers 200 or the deadline passes. During boot
 *  the port answers 503 (the boot page — boot.ts), so "any response" is no
 *  longer "ready"; readiness is the app handler actually serving. */
async function waitForServer(url: string, { timeout = 90000, interval = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status === 200) return res;
    } catch {
      // connection refused / timeout — keep polling
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeout}ms`);
}

test('app server boots and serves SPA + API endpoints', async () => {
  const port = await getPort();
  let proc;

  try {
    proc = spawn('npx', ['tsx', 'apps/server/src/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit',
      detached: true,
    });

    // Boot includes config load + content sync (~25s; longer under
    // full-suite CPU load). /api/config is a plain Hono route — no Vite
    // involvement — so it signals "server up" distinctly from the SPA path.
    const config = await waitForServer(`http://localhost:${port}/api/config`);
    expect(config.status).toBe(200);

    // '/' serves the catalog SPA through the Vite dev middleware.
    const home = await fetch(`http://localhost:${port}/`);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('/@vite/client');  // dev middleware actually active

    // SPA fallback routes serve the same shell.
    const preview = await fetch(`http://localhost:${port}/preview/demos/intro_course`);
    expect(preview.status).toBe(200);

    // Query strings must not fall through to the legacy proxy (regression:
    // '/?utm_source=x' once rendered a different front page than '/').
    const homeWithQuery = await fetch(`http://localhost:${port}/?smoke=1`);
    expect(homeWithQuery.status).toBe(200);
    expect(await homeWithQuery.text()).toContain('/@vite/client');

    // MCP endpoint answers at the raw-HTTP layer (GET without a session is
    // an expected client error, not a server failure).
    const mcp = await fetch(`http://localhost:${port}/mcp`);
    expect(mcp.status).toBeLessThan(500);
  } finally {
    if (proc?.pid) {
      // Detached process group: negative PID signals the whole group
      // (tsx spawns children).
      try { process.kill(-proc.pid, 'SIGTERM'); } catch {}
    }
  }
}, 180000); // 2026-07-04: boot ~25s alone; generous margin for full-suite CPU load.
