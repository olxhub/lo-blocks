// apps/static/scripts/stamp-pages.ts
//
// Post-build script: reads the Vite-built index.html and the manifest,
// then stamps out one index.html per route with the OLX key baked in.
//
// Usage: tsx apps/static/scripts/stamp-pages.ts
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const templatePath = path.join(distDir, 'index.html');
const manifestPath = path.join(distDir, 'static-content', 'manifest.json');

if (!fs.existsSync(templatePath)) {
  console.error(`No index.html found at ${templatePath}. Run 'vite build' first.`);
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error(`No manifest found at ${manifestPath}. Run 'build:static-content' first.`);
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf-8');
const manifest: { title?: string; routes: Record<string, string> } = JSON.parse(
  fs.readFileSync(manifestPath, 'utf-8')
);

const routes = Object.entries(manifest.routes);
if (routes.length === 0) {
  console.warn('Manifest has no routes. Nothing to stamp.');
  process.exit(0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const title = escapeHtml(manifest.title ?? 'Learning Observer');

let count = 0;
for (const [urlPath, olxKey] of routes) {
  let html = template
    .replace(/%OLX_KEY%/g, escapeHtml(olxKey))
    .replace(/%TITLE%/g, title);

  if (urlPath === '/') {
    // Root route: overwrite dist/index.html
    fs.writeFileSync(templatePath, html);
  } else {
    // Sub-route: write to dist/<path>/index.html
    const dir = path.join(distDir, urlPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
  count++;
}

console.log(`Stamped ${count} page(s) from manifest.`);
