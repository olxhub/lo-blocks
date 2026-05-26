// Reverse proxy to Next.js for un-migrated routes.
//
// During the transition from Next.js to the unified server, all HTTP requests
// (and non-/wsapi/ WebSocket upgrades like HMR) are forwarded to the Next.js
// dev server on :3000. As routes are migrated to the server, they get handled
// before reaching the proxy. When all routes are migrated, this file goes away.

import httpProxy from 'http-proxy';

const NEXT_TARGET = 'http://127.0.0.1:3000';

export const proxy = httpProxy.createProxyServer({
  target: NEXT_TARGET,
  ws: true,
});

// Don't crash the server on proxy errors (e.g. Next.js not running)
proxy.on('error', (err, req, res) => {
  console.error(`Proxy error → ${NEXT_TARGET}: ${err.message}`);
  // res might be a Socket (for WS upgrades), not an HTTP response
  if ('writeHead' in res && !res.headersSent) {
    (res as any).writeHead(502, { 'Content-Type': 'text/plain' });
    (res as any).end(`502 Bad Gateway: Next.js not reachable at ${NEXT_TARGET}`);
  }
});
