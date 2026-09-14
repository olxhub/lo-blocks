// apps/server/src/routes/deployInfo.ts
//
// GET /api/deploy-info — what is actually running on this host.
//
// The Ctrl+` debug panel's "Deploy" tab renders this
// (packages/shared/components/common/debug/DeployTab.tsx). Everything about
// how the answer is derived lives in ../deployIdentity.ts; this file is the
// HTTP surface and nothing else.
//
// Exposure: registered exactly like /api/config — same session resolution,
// behind the same nginx htpasswd, no new auth surface. Deploy info is not a
// secret to logged-in users, and it is not world-readable either.

import type { Context } from 'hono';
import { buildDeployIdentity } from '../deployIdentity.js';

// Re-read per request rather than serving the boot-time DEPLOY_IDENTITY.
// This endpoint exists to answer "is the thing I just deployed actually
// running" — a cached answer is the exact failure mode it is meant to
// eliminate. It is a manifest read plus three git invocations, on a route
// a human hits by hand.
export function handleDeployInfo(c: Context): Response {
  return c.json(buildDeployIdentity());
}
