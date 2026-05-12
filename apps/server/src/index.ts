#!/usr/bin/env npx tsx
// apps/server/src/index.ts
//
// The unified application server for Learning Opus.
//
// Primary protocol: WebSocket (state management, auth, event streams).
// Secondary: HTTP (proxied to Next.js during transition; eventually static
// file serving + API routes as Next.js is replaced).
//
// Architecture:
//   Browser → nginx (:8810 dev, :80/443 prod)
//              → this server (:8888)
//                 ├→ /wsapi/in/  → WebSocket handler
//                 └→ everything  → proxy to Next.js :3000 (transition)

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import { resolveUser } from './auth.js';
import { createConnectionLog, saveConnectionLog, type ConnectionLog } from './eventLog.js';
import { proxy } from './proxy.js';
import { MemoryKVStore } from './kvs.js';
import { runPipeline } from './pipeline.js';
import { handleOlxJson } from './routes/olxjson.js';

const PORT = 8888;
const WS_PATH = '/wsapi/in/';

// --- KVS -------------------------------------------------------------------
// In-memory for now. Future: select backend via PMSS config (Valkey, SQLite).
const kvs = new MemoryKVStore();

// --- HTTP server ------------------------------------------------------------
// All HTTP requests are proxied to Next.js. As routes migrate, they get
// handled here before reaching the proxy.
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname.startsWith('/api/olxjson/')) {
      await handleOlxJson(req, res, url);
      return;
    }

    proxy.web(req, res);
  } catch (err) {
    console.error('HTTP handler error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
    }
  }
});

// --- WebSocket server -------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });
const activeConnections = new Map<WebSocket, ConnectionLog>();

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith(WS_PATH)) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    // Proxy WS upgrades to Next.js (e.g. /_next/webpack-hmr for HMR)
    proxy.ws(req, socket, head);
  }
});

wss.on('connection', (ws: WebSocket, req) => {
  const user = resolveUser(req as any);
  const conn = createConnectionLog(user);
  activeConnections.set(ws, conn);
  console.log(
    `[${conn.id}] ${user.user_id} (${user.provenance}) connected from ` +
    `${req.socket.remoteAddress} → ${conn.path}`
  );

  // Echo the resolved identity back to the client. websocketLogger will stash
  // this in its storage shim and dispatch a DOM CustomEvent; reduxLogger
  // consumes that event and populates state.system.currentUser via the
  // settings.currentUser field. The client treats `user_id` as the only
  // required field; everything else is spread-through forward-compat.
  ws.send(JSON.stringify({ status: 'auth', ...user }));

  // Run the event pipeline. It drains when the connection closes.
  runPipeline({ ws, user, conn, kvs }).then(() => {
    console.log(`[${conn.id}] Client disconnected - ${conn.log.events.length} events saved`);
    saveConnectionLog(conn);
    activeConnections.delete(ws);
  }).catch((err) => {
    console.error(`[${conn.id}] Pipeline error:`, err);
    saveConnectionLog(conn);
    activeConnections.delete(ws);
  });
});

// --- Error handling ---------------------------------------------------------
server.on('error', (err) => {
  if ((err as any).code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is another server running?`);
    process.exit(1);
  }
  console.error('Server error:', err);
});

// --- Graceful shutdown ------------------------------------------------------
function shutdown() {
  console.log('\nShutting down...');
  for (const conn of activeConnections.values()) {
    saveConnectionLog(conn);
    console.log(`Saved ${conn.log.events.length} events to ${conn.path}`);
  }
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}${WS_PATH}`);
  console.log(`  HTTP: proxying to Next.js at http://127.0.0.1:3000`);
  console.log('Press Ctrl+C to stop.\n');
});
