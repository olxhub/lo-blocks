// apps/server/src/routes/admin.ts
//
// Ported from apps/web/app/api/admin/shutdown/route.ts (Next.js API route).
//
// GET /api/admin/shutdown — dev-only endpoint that exits the server process.

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

function checkAccess(c: Context): Response | null {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Shutdown not allowed in production' }, 403);
  }

  // Next.js used request.ip as the fallback; here the socket address comes
  // from @hono/node-server's connection info.
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : getConnInfo(c).remote.address;
  const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];

  if (ip && !allowedIPs.includes(ip)) {
    console.log('Blocked IP:', ip);
    return c.json({ error: 'Access denied' }, 403);
  }

  return null; // Access allowed
}

export async function handleShutdown(c: Context): Promise<Response> {
  const accessDenied = checkAccess(c);
  if (accessDenied) {
    return accessDenied;
  }

  // Raise the signal rather than exiting: SIGTERM is already wired to the
  // graceful shutdown in index.ts, which closes sockets and waits for every
  // event log to finish flushing. Calling process.exit() here was a SECOND,
  // independent termination path that skipped all of it and truncated the tail
  // of every open session's log. Termination logic is the kind of thing that
  // grows (a shutdown log, notifying an APM); it should grow in one place.
  // The delay is just so this response gets out the door first.
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100);
  return c.json({ message: 'Shutting down server...' });
}
