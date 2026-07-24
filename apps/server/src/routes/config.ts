// apps/server/src/routes/config.ts
//
// GET /api/config — serve PMSS configuration with per-namespace context.
//
// Returns JSON: { pmss, classes, attributes }
//
// The `ns` query parameter selects which manifest's classes and
// attributes to include. Without it, returns base PMSS with no
// course-specific context.
//
// At startup, scans content directories for manifest.yaml files and
// indexes them by namespace.

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Context } from 'hono';
import { loadContentSourcesConfig } from '@/lib/storage/lofs/contentSources';

const SYSTEM_PMSS_PATH = 'config/system.pmss';

// --- Namespace context from manifests ---------------------------------------

interface NamespaceContext {
  classes: string[];
  attributes: Record<string, string>;
}

// Map from namespace → context. Built once at startup.
// Cache invalidation: server restart. Manifests don't change at runtime.
let nsContextMap: Map<string, NamespaceContext> | null = null;

async function getNsContextMap(): Promise<Map<string, NamespaceContext>> {
  if (nsContextMap) return nsContextMap;
  nsContextMap = new Map();

  try {
    // Scan every configured content source (content-sources.yaml; defaults
    // to ./content) plus the fallback directory.
    // TODO(repo-sources): directory-form sources only. Repo-form sources
    // keep their manifest in git — namespace context (classes/attributes)
    // for those needs provider-based manifest reading, not an fs scan.
    const config = await loadContentSourcesConfig();
    const dirs = Object.values(config.sources).filter((s): s is string => typeof s === 'string');
    for (const dir of [...dirs, config.fallback]) {
      scanManifests(dir, nsContextMap);
    }
  } catch (err) {
    console.warn('[config] Failed to scan manifests:', err);
  }

  return nsContextMap;
}

function scanManifests(dir: string, map: Map<string, NamespaceContext>): void {
  const manifestPath = path.join(dir, 'manifest.yaml');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest?.namespace && typeof manifest.namespace === 'string') {
        const rawAttrs = manifest.attributes;
        const attributes: Record<string, string> =
          rawAttrs && typeof rawAttrs === 'object' && !Array.isArray(rawAttrs)
            ? Object.fromEntries(
                Object.entries(rawAttrs)
                  .filter((e): e is [string, string] => typeof e[1] === 'string')
              )
            : {};
        map.set(manifest.namespace, {
          classes: Array.isArray(manifest.classes) ? manifest.classes : [],
          attributes,
        });
      }
    } catch (err) {
      console.warn(`[config] Failed to parse ${manifestPath}:`, err);
    }
    return; // Don't recurse into subdirs of a manifest-bearing directory
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      scanManifests(path.join(dir, entry.name), map);
    }
  }
}

// --- Cached PMSS text --------------------------------------------------------

let cachedPmss: string | null = null;

function getPmss(): string {
  if (cachedPmss === null) {
    cachedPmss = fs.readFileSync(SYSTEM_PMSS_PATH, 'utf-8');
  }
  return cachedPmss;
}

// --- Handler ----------------------------------------------------------------

export async function handleConfig(c: Context): Promise<Response> {
  const pmss = getPmss();
  const ns = c.req.query('ns');

  let ctx: NamespaceContext | null = null;
  if (ns) {
    ctx = (await getNsContextMap()).get(ns) ?? null;
    if (!ctx) {
      console.warn(`[config] Unknown namespace: ${ns}`);
    }
  }

  return c.json({
    pmss,
    classes: ctx?.classes ?? [],
    attributes: ctx?.attributes ?? {},
  });
}
