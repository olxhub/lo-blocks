// apps/server/src/boot.ts
//
// Boot experience: bind the port IMMEDIATELY and own the window with a
// status page while startup runs, then hand the socket to the real
// server. Converts "connection refused" during the ~40s cold start into
// a live checklist, and settles order-of-operations by construction: the
// app handler is only installed once EVERY task is done, so nothing the
// app needs (content, storage, vite, websockets) can be missing when the
// first real request arrives.
//
// The task list is index.ts's existing startup sequence, wrapped — one
// tracker line per task, mirrored to the console and to /boot-status
// (JSON, polled by the boot page).

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';

export type BootTaskStatus = 'pending' | 'running' | 'done' | 'failed';

interface BootTask {
  name: string;
  status: BootTaskStatus;
  ms?: number;
  detail?: string;
}

export interface BootTracker {
  /** Run one named startup task; records timing + status, logs to console. */
  task<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
  /** Swap the boot handler for the real app. Call once, when ready. */
  handoff(): Server;
  /** The listening server (for startServer to adopt). */
  server: Server;
}

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Learning Opus — starting up</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; color: #1e293b; }
  h1 { font-size: 1.2rem; } li { margin: .4rem 0; list-style: none; }
  .done::before { content: "✓ "; color: #16a34a; }
  .running::before { content: "… "; color: #2563eb; }
  .pending::before { content: "· "; color: #94a3b8; }
  .failed::before { content: "✗ "; color: #dc2626; }
  .ms { color: #94a3b8; font-size: .85em; }
</style>
<h1>Learning Opus is starting up…</h1>
<ul id="tasks"></ul>
<p id="note" style="color:#64748b">This page reloads into the app when everything is ready.</p>
<script>
  let failures = 0;
  const note = (msg) => { document.getElementById('note').textContent = msg; };
  async function poll() {
    try {
      const r = await fetch('/boot-status');
      // 404 = the boot handler is gone, so handoff happened (an app
      // without this endpoint took the port) — reload into it.
      if (r.status === 404) { location.reload(); return; }
      if (!r.ok) throw new Error('boot-status ' + r.status);
      const s = await r.json();
      failures = 0;
      if (s.ready) { location.reload(); return; }
      document.getElementById('tasks').innerHTML = s.tasks.map(t =>
        '<li class="' + t.status + '">' + t.name +
        (t.ms ? ' <span class="ms">' + (t.ms/1000).toFixed(1) + 's</span>' : '') +
        (t.detail ? ' <span class="ms">— ' + t.detail + '</span>' : '') + '</li>'
      ).join('');
      note(s.tasks.some(t => t.status === 'failed')
        ? 'A startup task failed — check the server console.'
        : 'This page reloads into the app when everything is ready.');
    } catch (e) {
      // Network error (server restarting) or a 5xx/garbage response —
      // keep polling, but say so instead of sitting silent.
      failures++;
      if (failures >= 4) note('Can\\'t reach the server (' + e.message + ') — retrying…');
    }
    setTimeout(poll, 500);
  }
  poll();
</script>`;

/**
 * Bind `port` now and serve the boot page until handoff().
 * Throws immediately if the port is taken (fail fast — the old failure
 * mode was a silent EADDRINUSE zombie-server mystery).
 */
export async function startBoot(port: number): Promise<BootTracker> {
  const tasks: BootTask[] = [];
  let ready = false;

  const bootHandler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/boot-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready, tasks }));
      return;
    }
    res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '5' });
    res.end(PAGE);
  };

  const server = createServer(bootHandler);

  const tracker: BootTracker = {
    server,
    async task(name, fn) {
      const entry: BootTask = { name, status: 'running' };
      tasks.push(entry);
      const t0 = Date.now();
      console.log(`  [boot] ${name}…`);
      try {
        const result = await fn();
        entry.status = 'done';
        entry.ms = Date.now() - t0;
        console.log(`  [boot] ${name} — done (${(entry.ms / 1000).toFixed(1)}s)`);
        return result;
      } catch (err) {
        entry.status = 'failed';
        entry.ms = Date.now() - t0;
        entry.detail = err instanceof Error ? err.message : String(err);
        console.error(`  [boot] ${name} — FAILED (${(entry.ms / 1000).toFixed(1)}s): ${entry.detail}`);
        throw err;
      }
    },
    handoff() {
      ready = true;
      // The real handler is attached by startServer; drop ours so requests
      // flow only to the app. Poll responses in flight already said ready,
      // so open boot pages reload into the app.
      server.removeListener('request', bootHandler);
      return server;
    },
  };

  // A restarting dev server races the old process releasing the port, so
  // EADDRINUSE retries briefly (10 × 500ms, added 2026-07). A port that is
  // still taken after that is a real occupant — fail with one actionable
  // line; the stack adds nothing to "something else owns :8888".
  const RETRIES = 10;
  const RETRY_MS = 500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
          console.log(`  [boot] listening on :${port} (boot page up)`);
          resolve(tracker);
        });
      });
    } catch (err: any) {
      // Each failed listen() leaves its 'listening' listener behind;
      // clear both before the next attempt re-registers them.
      server.removeAllListeners('listening');
      server.removeAllListeners('error');
      if (err?.code !== 'EADDRINUSE') throw err;
      if (attempt >= RETRIES) {
        console.error(
          `Port ${port} is already in use — another server is running.\n` +
          `Stop it (npm run clean-zombies) or start this one on another port (PORT=...).`);
        process.exit(1);
      }
      if (attempt === 0) console.log(`  [boot] :${port} busy — waiting for it to free…`);
      await new Promise(r => setTimeout(r, RETRY_MS));
    }
  }
}
