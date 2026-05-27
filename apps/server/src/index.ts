#!/usr/bin/env npx tsx
// apps/server/src/index.ts
//
// The unified application server for Learning Opus.
//
// Hono handles HTTP routing and static file serving.
// WebSocket is handled directly via the `ws` library (not through Hono).
// The Next.js proxy remains as a fallback for un-migrated routes.
//
// Architecture:
//   Browser → nginx (:8810 dev, :80/443 prod)
//              → this server (:8888)
//                 ├→ /wsapi/in/     → WebSocket (event pipeline, via ws)
//                 ├→ /mcp           → MCP tools (StreamableHTTP, raw Node)
//                 ├→ /api/olxjson   → content API (Hono)
//                 ├→ /assets/*      → Vite-built client (Hono serveStatic)
//                 ├→ /preview/*     → SPA fallback (Hono serveStatic)
//                 └→ everything else → proxy to Next.js :3000 (transition)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { resolveBasicAuth, createGuestUser, type AuthUser } from './auth.js';
import { createConnectionLog, saveConnectionLog, type ConnectionLog } from './eventLog.js';
import { proxy } from './proxy.js';
import { FileKVStore } from './kvs.js';
import { runPipeline } from './pipeline.js';
import { handleOlxJson } from './routes/olxjson.js';
import { handleMcpPost, handleMcpGet, handleMcpDelete, shutdownMcp } from './mcp.js';
import { createToolRegistry } from '@/lib/mcp/registry';
import { registerDocsTools } from '@/lib/docs/tools';
import {
  parseCookie, verifySessionToken, createSessionToken, buildSetCookie
} from './session.js';

// --- Tool registry ----------------------------------------------------------
// Modules register their tools here. The registry serves MCP, Claude API
// tool_use format, and direct in-process calls from the same definitions.
const registry = createToolRegistry();

registerDocsTools(registry);
// TODO: registerLofsTools(registry, storage);

const PORT = 8888;
const WS_PATH = '/wsapi/in/';

// --- KVS -------------------------------------------------------------------
// File-backed by default — survives restarts, zero dependencies.
// Swap to ValkeyKVStore for multi-instance production deploys.
const kvs = new FileKVStore();

// --- Session-aware user resolution -----------------------------------------
// Priority: HTTP Basic auth > session cookie > new guest.
// Returns the user and whether a new session cookie should be set.

async function resolveUserWithSession(
  req: { headers: { authorization?: string; cookie?: string } }
): Promise<{ user: AuthUser; needsCookie: boolean }> {
  // 1. HTTP Basic auth always wins (production path via nginx)
  const basicUser = resolveBasicAuth(req);
  if (basicUser) return { user: basicUser, needsCookie: false };

  // 2. Check for existing session cookie
  const token = parseCookie(req.headers.cookie);
  if (token) {
    const sessionUser = await verifySessionToken(token);
    if (sessionUser) return { user: sessionUser, needsCookie: false };
  }

  // 3. Mint a new guest — caller should set cookie
  return { user: createGuestUser(), needsCookie: true };
}

// --- Hono app (HTTP only) --------------------------------------------------
const app = new Hono();

// API routes
app.get('/api/olxjson', handleOlxJson);

// Vite-built client (static files from apps/client/dist/)
app.use('/assets/*', serveStatic({ root: './apps/client/dist' }));

// SPA fallback: client-side routes serve index.html.
// Add route patterns here as they migrate from Next.js.
app.get('/preview/*', serveStatic({ root: './apps/client/dist', path: 'index.html' }));

const honoHandler = getRequestListener(app.fetch);

// --- Session cookie middleware for HTTP responses --------------------------
// Wraps the Hono handler to set a session cookie on responses when needed.
// The cookie must be set on an HTTP response before the WebSocket upgrade
// (browsers send cookies on WS upgrade requests to the same origin).

async function handleWithSession(req: IncomingMessage, res: ServerResponse) {
  const { user, needsCookie } = await resolveUserWithSession(req);

  if (needsCookie) {
    const token = await createSessionToken(user);
    res.setHeader('Set-Cookie', buildSetCookie(token));
  }

  await honoHandler(req, res);
}

// --- Session cookie for proxied responses ----------------------------------
// The proxy.web() call forwards the response from Next.js. We can't set
// headers after the proxy writes them, so we use the 'proxyRes' event to
// inject Set-Cookie into the upstream response before it reaches the client.
//
// We stash pending cookie values on the request object (keyed by a symbol)
// so the event handler can find them without a separate map.
const PENDING_COOKIE = Symbol('pendingSessionCookie');

proxy.on('proxyRes', (proxyRes, req) => {
  const cookie = (req as any)[PENDING_COOKIE] as string | undefined;
  if (!cookie) return;

  // Merge with any Set-Cookie headers from the upstream response
  const existing = proxyRes.headers['set-cookie'] || [];
  const cookies = Array.isArray(existing) ? existing : [existing];
  cookies.push(cookie);
  proxyRes.headers['set-cookie'] = cookies;
});

// --- HTTP server -----------------------------------------------------------
// Prefixes owned by this server. Everything else proxies to Next.js.
// Note: /api/ is intentionally narrow — only /api/olxjson is handled here.
const SERVER_PREFIXES = ['/api/olxjson', '/assets/', '/preview/'];

const server = createServer(async (req, res) => {
  const url = req.url || '/';

  // MCP endpoint — handled at raw HTTP level (needs Node.js req/res for
  // StreamableHTTPServerTransport, same reason WebSocket uses raw `ws`).
  if (url === '/mcp' || url.startsWith('/mcp?')) {
    try {
      if (req.method === 'POST') await handleMcpPost(req, res, registry);
      else if (req.method === 'GET') await handleMcpGet(req, res);
      else if (req.method === 'DELETE') await handleMcpDelete(req, res);
      else {
        res.writeHead(405, { Allow: 'GET, POST, DELETE' });
        res.end();
      }
    } catch (err) {
      console.error('[MCP] Error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return;
  }

  if (SERVER_PREFIXES.some(p => url.startsWith(p))) {
    await handleWithSession(req, res);
  } else {
    // Resolve session before proxying so the cookie gets set on the
    // first page load (which is served by Next.js). The proxyRes handler
    // above picks up the stashed cookie value.
    const { needsCookie, user } = await resolveUserWithSession(req);
    if (needsCookie) {
      const token = await createSessionToken(user);
      (req as any)[PENDING_COOKIE] = buildSetCookie(token);  // symbol key on req
    }
    proxy.web(req, res);
  }
});

// --- WebSocket server (via ws, not Hono) -----------------------------------
// TODO: We use the raw `ws` library here because we need to selectively proxy
// non-matching WS upgrades to Next.js (e.g. HMR). @hono/node-ws intercepts
// ALL upgrades, breaking that. Once Next.js is removed, switch to @hono/node-ws
// so WebSocket handling lives inside Hono alongside the HTTP routes.
const wss = new WebSocketServer({ noServer: true });
const activeConnections = new Map<WebSocket, ConnectionLog>();

// Resolve user identity during the HTTP upgrade — before the WebSocket is
// established — so the connection handler can be fully synchronous. This
// avoids a race where messages arriving during an async resolveUserWithSession
// would be dropped because the pipeline's message listener wasn't attached yet.
const RESOLVED_USER = Symbol('resolvedUser');

server.on('upgrade', async (req, socket, head) => {
  if (req.url?.startsWith(WS_PATH)) {
    const { user } = await resolveUserWithSession(req);
    (req as any)[RESOLVED_USER] = user;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    // Proxy WS upgrades to Next.js (e.g. /_next/webpack-hmr for HMR)
    proxy.ws(req, socket, head);
  }
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const user: AuthUser = (req as any)[RESOLVED_USER];
  const conn = createConnectionLog(user);
  activeConnections.set(ws, conn);
  console.log(
    `[${conn.id}] ${user.user_id} (${user.provenance}) connected from ` +
    `${req.socket.remoteAddress} → ${conn.path}`
  );

  ws.send(JSON.stringify({ status: 'auth', ...user }));

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

// --- Start ------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}${WS_PATH}`);
  console.log(`  Client: apps/client/dist/`);
  console.log(`  MCP: http://localhost:${PORT}/mcp`);
  console.log(`  Fallback: proxying to Next.js at http://127.0.0.1:3000`);
  console.log('Press Ctrl+C to stop.\n');
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
  shutdownMcp();
  for (const conn of activeConnections.values()) {
    saveConnectionLog(conn);
    console.log(`Saved ${conn.log.events.length} events to ${conn.path}`);
  }
  Promise.resolve(kvs.close?.()).then(() => {
    server.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
