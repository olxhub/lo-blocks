// apps/server/src/server.ts
//
// HTTP + WebSocket server wiring.
//
// Architecture:
//   Browser → nginx (:8810 dev, :80/443 prod)
//              → this server (:8888)
//                 ├→ /wsapi/in/     → WebSocket (event pipeline, via ws)
//                 ├→ /mcp           → MCP tools (StreamableHTTP, raw Node)
//                 ├→ /api/olxjson   → content API (Hono)
//                 ├→ /api/config    → PMSS configuration (Hono)
//                 ├→ /api/translate → content translation (Hono)
//                 ├→ /assets/*      → Vite-built client (Hono serveStatic)
//                 ├→ /preview/*     → SPA fallback (Hono serveStatic)
//                 ├→ /repo/*        → SPA fallback (Hono serveStatic)
//                 └→ everything else → proxy to Next.js :3000 (transition)

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Hono, type Context, type Next } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ViteDevServer } from 'vite';

import type { KVStore } from './kvs.js';
import type { AuthUser } from './auth.js';
import {
  resolveUserWithSession, createSessionToken, buildSetCookie
} from './session.js';
import { createConnectionLog, saveConnectionLog, type ConnectionLog } from './eventLog.js';
import { proxy } from './proxy.js';
import { runPipeline } from './pipeline.js';
import { handleOlxJson } from './routes/olxjson.js';
import { handleConfig } from './routes/config.js';
import { createLLMHandler } from './routes/llm.js';
import { handleTranslate } from './routes/translate.js';
import { handleActivities } from './routes/activities.js';
import { handleShutdown } from './routes/admin.js';
import { handleFileGet, handleFilePost, handleFileDelete, handleFilePut } from './routes/file.js';
import { handleFilesGet } from './routes/files.js';
import { handleGrep } from './routes/grep.js';
import { handleSourcesGet } from './routes/sources.js';
import { handleMcpPost, handleMcpGet, handleMcpDelete } from './mcp.js';
import { ToolRegistry } from '@/lib/mcp/registry';

// --- Constants ---------------------------------------------------------------
// Overridable for tests (the smoke test boots a second instance beside a
// running dev server); 8888 is the canonical port — see docs/README.md.
const PORT = Number(process.env.PORT ?? 8888);
const WS_PATH = '/wsapi/in/';
// '/' serves the catalog SPA (a static-client route) from apps/client/dist.
// The legacy Next.js pages remain reachable at paths not claimed by this
// server (i.e. not '/' and not one of SERVER_PREFIXES) during the migration.
// The catalog's DATA comes from the get_repositories MCP tool over /mcp (one
// transport) — there is no /api/catalog. See docs/ux.md + docs/mcp-authoring.md.
const SERVER_PREFIXES = [
  '/api/olxjson', '/api/config', '/api/translate', '/api/llm/',
  '/api/activities', '/api/admin/', '/api/file', '/api/files',
  '/api/grep', '/api/sources',
  '/assets/', '/preview/', '/repo/', '/docs',
];

// Symbols for annotating request objects between middleware stages
const PENDING_COOKIE = Symbol('pendingSessionCookie');
const RESOLVED_USER = Symbol('resolvedUser');

// --- Types -------------------------------------------------------------------

export interface ServerHandle {
  server: Server;
  activeConnections: Map<WebSocket, ConnectionLog>;
}

// --- startServer -------------------------------------------------------------

export async function startServer(
  kvs: KVStore,
  registry: ToolRegistry
): Promise<ServerHandle> {
  // Dev serves the client through Vite's dev middleware on this port —
  // on-demand transforms + HMR, no build step. Production serves the
  // prebuilt apps/client/dist. `vite` is assigned after the http server
  // exists (its HMR websocket attaches to it); Hono handlers close over it.
  const clientDev = process.env.NODE_ENV !== 'production';
  let vite: ViteDevServer | undefined;

  // --- Hono app (HTTP only) ------------------------------------------------
  const app = new Hono();

  app.get('/api/olxjson', handleOlxJson);
  app.get('/api/config', handleConfig);
  app.post('/api/translate', handleTranslate);
  app.post('/api/llm/chat/completions', createLLMHandler(kvs));
  app.get('/api/activities', handleActivities);
  app.get('/api/admin/shutdown', handleShutdown);
  app.get('/api/file', handleFileGet);
  app.post('/api/file', handleFilePost);
  app.delete('/api/file', handleFileDelete);
  app.put('/api/file', handleFilePut);
  app.get('/api/files', handleFilesGet);
  app.get('/api/grep', handleGrep);
  app.get('/api/sources', handleSourcesGet);

  // Vite-built client (static files from apps/client/dist/)
  app.use('/assets/*', serveStatic({ root: './apps/client/dist' }));

  // SPA fallback: client-side routes serve index.html.
  // Add route patterns here as they migrate from Next.js.
  //
  // Dev: index.html comes from Vite (transformIndexHtml injects the HMR
  // client and module scripts; modules are transformed on demand).
  // Prod: apps/client/dist, which only exists after `npm run build:client`.
  const clientIndexPath = './apps/client/dist/index.html';
  let clientBuilt = existsSync(clientIndexPath);
  const serveClientIndex = serveStatic({ root: './apps/client/dist', path: 'index.html' });
  const spaIndex = async (c: Context, next: Next) => {
    if (vite) {
      const raw = await readFile('./apps/client/index.html', 'utf-8');
      return c.html(await vite.transformIndexHtml(c.req.path, raw));
    }
    if (!clientBuilt) clientBuilt = existsSync(clientIndexPath);
    if (!clientBuilt) {
      return c.text(
        `Client build not found: ${path.resolve(clientIndexPath)} does not exist.\n\n` +
        'This server is running with NODE_ENV=production, which serves the\n' +
        'prebuilt client. Run `npm run build:client` first, or run without\n' +
        'NODE_ENV=production to serve the client through Vite dev middleware.',
        503
      );
    }
    return serveClientIndex(c, next);
  };
  app.get('/', spaIndex);
  app.get('/preview/*', spaIndex);
  app.get('/repo/*', spaIndex);
  app.get('/docs', spaIndex);
  app.get('/docs/*', spaIndex);

  const honoHandler = getRequestListener(app.fetch);

  // --- Session cookie middleware -------------------------------------------
  // Wraps the Hono handler to set a session cookie on responses when needed.
  // The cookie must be set on an HTTP response before the WebSocket upgrade
  // (browsers send cookies on WS upgrade requests to the same origin).

  async function handleWithSession(req: IncomingMessage, res: ServerResponse) {
    const { user, needsCookie } = await resolveUserWithSession(req);
    if (needsCookie) {
      const token = await createSessionToken(user);
      res.setHeader('Set-Cookie', buildSetCookie(token));
    }
    // Stash user on the IncomingMessage so Hono handlers can access it via
    // c.env.incoming.__user (c.req.raw is a Web API Request, not the Node object).
    (req as any).__user = user;
    await honoHandler(req, res);
  }

  // --- Session cookie for proxied responses --------------------------------
  // The proxy.web() call forwards the response from Next.js. We can't set
  // headers after the proxy writes them, so we use the 'proxyRes' event to
  // inject Set-Cookie into the upstream response before it reaches the client.

  proxy.on('proxyRes', (proxyRes, req) => {
    const cookie = (req as any)[PENDING_COOKIE] as string | undefined;
    if (!cookie) return;

    const existing = proxyRes.headers['set-cookie'] || [];
    const cookies = Array.isArray(existing) ? existing : [existing];
    cookies.push(cookie);
    proxyRes.headers['set-cookie'] = cookies;
  });

  // --- HTTP server ---------------------------------------------------------
  // Prefixes owned by this server. Everything else proxies to Next.js.
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

    if (url === '/' || url.startsWith('/?') || SERVER_PREFIXES.some(p => url.startsWith(p))) {
      await handleWithSession(req, res);
    } else {
      // Resolve session before proxying so the cookie gets set on the
      // first page load (which is served by Next.js). The proxyRes handler
      // above picks up the stashed cookie value.
      const proxyToNext = async () => {
        const { needsCookie, user } = await resolveUserWithSession(req);
        if (needsCookie) {
          const token = await createSessionToken(user);
          (req as any)[PENDING_COOKIE] = buildSetCookie(token);
        }
        proxy.web(req, res);
      };
      // In dev, Vite's middleware serves its module/asset URLs (/src/*,
      // /@vite/*, /@fs/*, prebundled deps) and calls next() for anything it
      // doesn't own — which continues to the Next.js proxy as before.
      if (vite) vite.middlewares(req, res, () => { void proxyToNext(); });
      else await proxyToNext();
    }
  });

  // --- Vite dev middleware (dev only) ---------------------------------------
  // await-imported so production never loads Vite (or the client's plugin
  // chain) — the client is served from dist there.
  // The config is imported as a module rather than passed as configFile:
  // Vite's config loader bundles configFile to a temp .mjs next to it and
  // imports it in-process, which lands the (immediately deleted) temp file
  // in tsx --watch's module graph and restart-loops the server.
  // appType 'custom' disables Vite's own HTML fallback: unmatched paths must
  // keep flowing to the Next.js proxy during the migration.
  if (clientDev) {
    const { createServer: createViteServer } = await import('vite');
    const { default: clientViteConfig } = await import('../../client/vite.config');
    vite = await createViteServer({
      ...clientViteConfig,
      configFile: false,
      appType: 'custom',
      server: { middlewareMode: true, hmr: { server } },
    });
  }

  // --- WebSocket server (via ws, not Hono) ---------------------------------
  // TODO: We use the raw `ws` library here because we need to selectively
  // proxy non-matching WS upgrades to Next.js (e.g. HMR). @hono/node-ws
  // intercepts ALL upgrades, breaking that. Once Next.js is removed, switch
  // to @hono/node-ws so WebSocket handling lives inside Hono.
  const wss = new WebSocketServer({ noServer: true });
  const activeConnections = new Map<WebSocket, ConnectionLog>();

  // Resolve user identity during the HTTP upgrade — before the WebSocket is
  // established — so the connection handler can be fully synchronous. This
  // avoids a race where messages arriving during an async resolveUserWithSession
  // would be dropped because the pipeline's message listener wasn't attached yet.
  server.on('upgrade', async (req, socket, head) => {
    // Vite's HMR websocket: Vite attached its own upgrade listener to this
    // server (hmr: { server } below); it identifies its sockets by this
    // subprotocol. Node fires every upgrade listener, so ours must not
    // claim the socket too.
    if (req.headers['sec-websocket-protocol']?.includes('vite-hmr')) return;
    if (req.url?.startsWith(WS_PATH)) {
      const { user } = await resolveUserWithSession(req);
      (req as any)[RESOLVED_USER] = user;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
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
      console.log(`[${conn.id}] Client disconnected - ${conn.log.eventCount} events`);
    }).catch((err) => {
      console.error(`[${conn.id}] Pipeline error:`, err);
    }).finally(() => {
      saveConnectionLog(conn)
        .catch((err) => console.error(`[${conn.id}] Error saving event log:`, err))
        .finally(() => activeConnections.delete(ws));
    });
  });

  // --- Error handling ------------------------------------------------------
  server.on('error', (err) => {
    if ((err as any).code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Is another server running?`);
      process.exit(1);
    }
    console.error('Server error:', err);
  });

  // --- Listen --------------------------------------------------------------
  await new Promise<void>((resolve) => {
    server.listen(PORT, resolve);
  });

  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`    WebSocket: ws://localhost:${PORT}${WS_PATH}`);
  console.log(`    Client:    ${vite ? 'Vite dev middleware (HMR, on-demand transforms)' : 'apps/client/dist/ (prebuilt)'}`);
  console.log(`    MCP:       http://localhost:${PORT}/mcp`);
  console.log(`    Fallback:  proxy → Next.js at http://127.0.0.1:3000`);

  return { server, activeConnections };
}
