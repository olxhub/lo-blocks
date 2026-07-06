// apps/server/src/routes/sources.ts
//
// Ported from apps/web/app/api/sources/route.ts (Next.js API route).
//
// Source registry API — the authoring-facing list of content sources Studio
// shows in its working-repo picker.
//
// GET /api/sources  → { ok, sources: [{ origin, label, writable }] }
//
// Writable sources first, then read-only (the order the picker renders). This
// is the configured set (config/content-sources.yaml + fallback); importing an
// arbitrary origin is a later flow (see docs/lofs-api.md).
//
import type { Context } from 'hono';
import { sources } from '@/lib/lofs/contentSources';

// Resolved per request (re-reads config; git clones are cached). See contentSources.ts.

export async function handleSourcesGet(c: Context): Promise<Response> {
  try {
    return c.json({ ok: true, sources: await sources() });
  } catch (err: any) {
    console.error(`[API /sources] ${err.message}`);
    return c.json({ ok: false, error: err.message }, 500);
  }
}
