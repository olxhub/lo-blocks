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
//                 └→ everything else → 404

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Hono, type Context, type Next } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ViteDevServer } from 'vite';

import type { KVStore } from '@/lib/storage/kvs';
import type { AuthUser } from './auth.js';
import {
  resolveUserWithSession, createSessionToken, buildSetCookie
} from './session.js';
import { createConnectionLog, saveConnectionLog, type ConnectionLog } from './eventLog.js';
import { runPipeline } from './pipeline.js';
import { UserStateRegistry } from '@/lib/state/sync/registry';
import { SubscriptionRegistry } from '@/lib/state/sync/subscriptions';
import { makeGroupingIndex } from '@/lib/state/sync/partitions';
import { makeAggregationIndex } from '@/lib/state/sync/aggregations';
import { makeFieldLevelIndex } from '@/lib/state/sync/fieldLevels';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { createOlxJsonHandler } from './routes/olxjson.js';
import { handleConfig } from './routes/config.js';
import { resolveConfig } from '@/lib/config';
import { createLLMHandler } from './routes/llm.js';
import { handleTranslate } from './routes/translate.js';
import { handleActivities } from './routes/activities.js';
import { handleShutdown } from './routes/admin.js';
import { handleMcpPost, handleMcpGet, handleMcpDelete } from './mcp.js';
import { ToolRegistry } from '@/lib/mcp/registry';

// --- Constants ---------------------------------------------------------------
// Overridable for tests (the smoke test boots a second instance beside a
// running dev server); 8888 is the canonical port — see docs/README.md.
const PORT = Number(process.env.PORT ?? 8888);
const WS_PATH = '/wsapi/in/';
// '/' serves the catalog SPA (a static-client route) from apps/client/dist.
// The catalog's DATA comes from the get_repositories MCP tool over /mcp (one
// transport) — there is no /api/catalog. File/search/source operations are
// MCP tools too (lib/storage/lofs/tools.ts); the /api/file|files|grep|sources REST
// routes are retired.
const SERVER_PREFIXES = [
  '/api/olxjson', '/api/config', '/api/translate', '/api/llm/',
  '/api/activities', '/api/admin/', '/boot-status',
  '/assets/', '/content/', '/preview/', '/repo/', '/docs', '/studio',
];

// Symbols for annotating request objects between middleware stages
const RESOLVED_USER = Symbol('resolvedUser');

// --- Types -------------------------------------------------------------------

export interface ServerHandle {
  server: Server;
  activeConnections: Map<WebSocket, ConnectionLog>;
}

// --- startServer -------------------------------------------------------------

export async function startServer(
  kvs: KVStore,
  registry: ToolRegistry,
  /** The boot tracker to adopt (already-listening server + handoff — see
   *  boot.ts). handoff() is called HERE, synchronously adjacent to the
   *  request-handler attach: detaching the boot handler any earlier leaves
   *  a listener-less window where requests hang forever. */
  boot?: { server: Server; handoff: () => Server },
): Promise<ServerHandle> {
  // Dev serves the client through Vite's dev middleware on this port —
  // on-demand transforms + HMR, no build step. Production serves the
  // prebuilt apps/client/dist. `vite` MUST be assigned before the request
  // handler attaches: with an adopted (already-listening) boot server, a
  // request in the gap would see vite undefined and silently serve a stale
  // dist build. Created right after the server exists (HMR needs it).
  const clientDev = process.env.NODE_ENV !== 'production';
  let vite: ViteDevServer | undefined;

  const server = boot?.server ?? createServer();

  // --- Vite dev middleware (dev only) ----------------------------------------
  // await-imported so production never loads Vite. The config is imported
  // as a module rather than passed as configFile: Vite's config loader
  // bundles configFile to a temp .mjs and imports it in-process, which
  // lands the (immediately deleted) temp file in tsx --watch's module
  // graph and restart-loops the server. appType 'custom' disables Vite's
  // own HTML fallback: unmatched paths must keep flowing to the
  // 404 fallthrough.
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

  // One shared per-user state registry for the whole server — all of a
  // user's connections fold into a single materialization (userState.ts).
  // Created before the routes: /api/olxjson reads it for initial field
  // state, the WS pipeline writes it.
  const stateRegistry = new UserStateRegistry(kvs);
  // Content fetches subscribe connections to the blocks they serve;
  // shared/server fan-out targets subscribers only (subscriptions.ts).
  const subscriptions = new SubscriptionRegistry();
  // Grouping index (specs + picker reverse map), TTL-cached from content.
  const grouping = makeGroupingIndex(
    async () => (await syncContentFromStorage()).idMap as any,
  );
  // Aggregation index: view blocks whose blueprints fold other blocks'
  // answers (aggregations.ts), TTL-cached from content + registry.
  const aggregations = makeAggregationIndex(
    async () => (await syncContentFromStorage()).idMap as any,
    (tag) => (BLOCK_REGISTRY as any)[tag]?.fields,
  );
  // Trusted level declarations (fieldLevels.ts): routing derives a
  // field's level from content + registry, never from the wire's
  // authority stamp — without this index every field is level 'user'.
  const fieldLevels = makeFieldLevelIndex(
    async () => (await syncContentFromStorage()).idMap as any,
    (tag) => (BLOCK_REGISTRY as any)[tag]?.fields,
  );

  // --- Hono app (HTTP only) ------------------------------------------------
  const app = new Hono();

  // Boot pages poll this until ready and then reload into the app — it
  // must keep answering AFTER handoff (boot.ts serves it during boot; a
  // 404 here strands open boot pages in their retry loop forever).
  app.get('/boot-status', (c) => c.json({ ready: true, tasks: [] }));
  app.get('/api/olxjson', createOlxJsonHandler(stateRegistry, subscriptions));
  app.get('/api/config', handleConfig);
  app.post('/api/translate', handleTranslate);
  app.post('/api/llm/chat/completions', createLLMHandler(kvs));
  app.get('/api/activities', handleActivities);
  app.get('/api/admin/shutdown', handleShutdown);

  // Vite-built client (static files from apps/client/dist/)
  app.use('/assets/*', serveStatic({ root: './apps/client/dist' }));
  // Content assets (images, PDFs, video) — copied by copyAssetsToPublic
  // into apps/server/public/content during content sync. Interim: assets
  // serve by hash from the lake once content lives there.
  app.use('/content/*', serveStatic({ root: './apps/server/public' }));

  // SPA fallback: client-side routes serve index.html.
  // Add route patterns here as new client pages appear.
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
  app.get('/studio', spaIndex);

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

  // --- HTTP request handler --------------------------------------------------
  // The server was created (or adopted from the boot page — boot.ts) above,
  // BEFORE vite, so no request can see a half-initialized closure. The
  // boot→app swap is atomic: detach and attach in the same synchronous tick.
  boot?.handoff();
  server.on('request', async (req, res) => {
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
      // Unclaimed path → explicit 404. (In dev, Vite's middleware first
      // serves its module/asset URLs — /src/*, /@vite/*, /@fs/*,
      // prebundled deps — and calls next() for anything it doesn't own.)
      const notFound = () => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(
          `No route for ${url}\n\n` +
          `If this path should exist, it needs a route in apps/server ` +
          `or apps/client.`
        );
      };
      if (vite) vite.middlewares(req, res, notFound);
      else notFound();
    }
  });

  // (Vite dev middleware is created near the top of startServer — before
  // the request handler attaches — see the comment there.)

  // --- WebSocket server (via ws, not Hono) ---------------------------------
  // TODO: raw `ws` predates Hono here; the only other upgrade consumer is
  // Vite HMR (its own listener). @hono/node-ws intercepts ALL upgrades, so
  // switching means routing HMR through it too — worth doing when WebSocket
  // handling next changes, not before.
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
      socket.destroy();  // unknown upgrade path — nothing to hand it to
    }
  });

  // Which store serves state on fetch_blob (config/server.pmss). Read per
  // connection so a config change applies to new sessions without restart.
  const readCanonical = (): 'blob' | 'fields' => {
    const v = resolveConfig({}, 'state-canonical');
    if (v !== 'blob' && v !== 'fields') {
      throw new Error(`state-canonical must be blob or fields, got: ${v}`);
    }
    return v;
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const canonical = readCanonical();
    const user: AuthUser = (req as any)[RESOLVED_USER];
    const conn = createConnectionLog(user);
    activeConnections.set(ws, conn);
    console.log(
      `[${conn.id}] ${user.user_id} (${user.provenance}) connected from ` +
      `${req.socket.remoteAddress} → ${conn.path}`
    );

    ws.send(JSON.stringify({ status: 'auth', ...user }));

    runPipeline({ ws, user, conn, kvs, canonical, stateRegistry, subscriptions, fieldLevels, grouping, aggregations }).then(() => {
      console.log(`[${conn.id}] Client disconnected - ${conn.log.eventCount} events`);
    }).catch((err) => {
      console.error(`[${conn.id}] Pipeline error:`, err);
      // A dead pipeline must not leave a live socket: the client would
      // hang on "Loading user state…" waiting for a fetch_blob response
      // that can never come. 1011 = server error; the client reconnects
      // or fails visibly. (Observed 2026-07-07 with a mixed-generation
      // hot reload.)
      try { ws.close(1011, 'pipeline failed'); } catch { /* already gone */ }
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
  // The adopted boot server is already listening; only bind when standalone.
  if (!boot) {
    await new Promise<void>((resolve) => {
      server.listen(PORT, resolve);
    });
  }

  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`    WebSocket: ws://localhost:${PORT}${WS_PATH}`);
  console.log(`    Client:    ${vite ? 'Vite dev middleware (HMR, on-demand transforms)' : 'apps/client/dist/ (prebuilt)'}`);
  console.log(`    MCP:       http://localhost:${PORT}/mcp`);
  console.log(`    Fallback:  unclaimed paths 404`);

  return { server, activeConnections };
}
