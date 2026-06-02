// routes/config.ts
//
// GET /api/config — serve the system PMSS configuration.
//
// Returns the raw PMSS text so clients can resolve it locally with their
// own class context (app profile, deployment mode, etc.).
//
// TODO: Course-level PMSS overrides (per-launchable settings, manifest
// classes) are not yet delivered here.

import fs from 'fs';
import type { Context } from 'hono';

const SYSTEM_PMSS_PATH = 'config/system.pmss';

export function handleConfig(c: Context): Response {
  const pmss = fs.readFileSync(SYSTEM_PMSS_PATH, 'utf-8');
  return c.text(pmss);
}
