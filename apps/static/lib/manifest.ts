// apps/static/lib/manifest.ts
//
// Route manifest reader. The manifest maps URL paths to OlxKeys.
//
// Format:
// {
//   "title": "My Workshop",
//   "routes": {
//     "/": "workshop_intro",
//     "/exercise/1": "exercise_one"
//   }
// }
//

import fs from 'fs';
import path from 'path';

export interface StaticManifest {
  title?: string;
  routes: Record<string, string>;  // URL path → OlxKey
}

/**
 * Read the manifest from the static-content directory.
 * Called at build time by server components.
 *
 * `next build apps/static` runs from the repo root, so process.cwd()
 * is the repo root. The app's public directory is at apps/static/public/.
 */
export function readManifest(): StaticManifest {
  const manifestPath = path.join(process.cwd(), 'apps', 'static', 'public', 'static-content', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No manifest found at ${manifestPath}. Run the export-static-content script first.`
    );
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

/**
 * Resolve a slug array to an OlxKey using the manifest.
 */
export function resolveSlug(manifest: StaticManifest, slug?: string[]): string | null {
  const urlPath = slug ? '/' + slug.join('/') : '/';
  return manifest.routes[urlPath] || null;
}
