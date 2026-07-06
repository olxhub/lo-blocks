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
  async function poll() {
    try {
      const r = await fetch('/boot-status');
      const s = await r.json();
      if (s.ready) { location.reload(); return; }
      document.getElementById('tasks').innerHTML = s.tasks.map(t =>
        '<li class="' + t.status + '">' + t.name +
        (t.ms ? ' <span class="ms">' + (t.ms/1000).toFixed(1) + 's</span>' : '') +
        (t.detail ? ' <span class="ms">— ' + t.detail + '</span>' : '') + '</li>'
      ).join('');
      if (s.tasks.some(t => t.status === 'failed'))
        document.getElementById('note').textContent = 'A startup task failed — check the server console.';
    } catch (e) { /* server restarting between polls — keep trying */ }
    setTimeout(poll, 500);
  }
  poll();
</script>`;

/**
 * Bind `port` now and serve the boot page until handoff().
 * Throws immediately if the port is taken (fail fast — the old failure
 * mode was a silent EADDRINUSE zombie-server mystery).
 */
export function startBoot(port: number): Promise<BootTracker> {
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

  return new Promise((resolve, reject) => {
    server.once('error', reject);   // EADDRINUSE etc. — fail loud, fail now
    server.listen(port, () => {
      console.log(`  [boot] listening on :${port} (boot page up)`);
      resolve(tracker);
    });
  });
}
