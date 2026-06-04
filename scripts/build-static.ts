#!/usr/bin/env tsx
// scripts/build-static.ts
//
// Manifest-driven static site builder.
//
// Usage:
//   tsx scripts/build-static.ts --manifest content/sba/psychology/manifest.yaml
//   tsx scripts/build-static.ts --manifest content/sba/psychology/manifest.yaml --serve
//
// The manifest YAML is the single entry point. It declares title, routes,
// classes, and optional overrides. The script orchestrates:
//   1. Parse manifest
//   2. xml2json — parse OLX content into JSON
//   3. Vite build — bundle the static React app
//   4. stamp-pages — create per-route index.html files
//   5. sync-images — copy media assets to output
//   6. (optional) serve — launch a local static server
//
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(name);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const manifestFlag = getArg('--manifest');
const serveFlag = getFlag('--serve');

if (!manifestFlag) {
  console.error('Usage: tsx scripts/build-static.ts --manifest <path-to-manifest.yaml> [--serve]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.resolve(manifestFlag);

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifestDir = path.dirname(manifestPath);

// ---------------------------------------------------------------------------
// 1. Parse manifest
// ---------------------------------------------------------------------------

interface Manifest {
  title?: string;
  namespace?: string;
  classes?: string[];
  eventServerUrl?: string | false;
  content_notice?: string;
  content_root?: string;
  output?: string;
  routes: Record<string, string>;
}

console.log('=== build-static ===\n');

const raw = fs.readFileSync(manifestPath, 'utf-8');
const manifest: Manifest = YAML.parse(raw);

if (!manifest.routes || Object.keys(manifest.routes).length === 0) {
  console.error('Manifest must declare at least one route.');
  process.exit(1);
}

// Namespace: explicit or derived from manifest directory name
const namespace = manifest.namespace
  || path.basename(manifestDir);
if (!manifest.namespace) {
  console.warn(`  Warning: no 'namespace' in manifest. Defaulting to '${namespace}' from directory name.`);
}

const contentRoot = path.resolve(manifestDir, manifest.content_root || '.');
const outputDir = manifest.output
  ? path.resolve(repoRoot, manifest.output)
  : path.resolve(repoRoot, 'dist', namespace);

console.log(`  Manifest:     ${manifestPath}`);
console.log(`  Namespace:    ${namespace}`);
console.log(`  Content root: ${contentRoot}`);
console.log(`  Output:       ${outputDir}`);
console.log(`  Routes:       ${Object.keys(manifest.routes).length}`);
console.log();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sandboxSh = path.join(repoRoot, 'sandbox.sh');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');

function run(label: string, cmd: string, cmdArgs: string[], env?: Record<string, string>) {
  console.log(`--- ${label} ---`);
  const merged = { ...process.env, ...env };
  try {
    execFileSync(cmd, cmdArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: merged,
    });
  } catch (e: unknown) {
    const code = (e as { status?: number }).status ?? 1;
    console.error(`\n${label} failed (exit ${code}).`);
    process.exit(code);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Write a temporary static.config.json for xml2json's --manifest flag
// (xml2json reads the manifest to validate routes)
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-build-'));
const tmpStaticConfig = path.join(tmpDir, 'static.config.json');
const staticContentDir = path.join(tmpDir, 'static-content');
fs.mkdirSync(staticContentDir, { recursive: true });

const staticConfig = {
  title: manifest.title || 'Learning Observer',
  eventServerUrl: manifest.eventServerUrl ?? false,
  classes: manifest.classes || [],
  content_notice: manifest.content_notice || '',
  routes: manifest.routes,
};
fs.writeFileSync(tmpStaticConfig, JSON.stringify(staticConfig, null, 2));

// ---------------------------------------------------------------------------
// 2. xml2json — parse OLX content
// ---------------------------------------------------------------------------

run('xml2json', sandboxSh, [
  tsxBin,
  'packages/shared/scripts/xml2json.ts',
  '--content', contentRoot,
  '--manifest', tmpStaticConfig,
  '--static-dir', staticContentDir,
]);

// ---------------------------------------------------------------------------
// 3. Vite build
// ---------------------------------------------------------------------------

// Copy static-content into the Vite public dir so it ends up in the bundle.
const vitePublicStaticContent = path.join(repoRoot, 'apps', 'static', 'public', 'static-content');
fs.rmSync(vitePublicStaticContent, { recursive: true, force: true });
fs.cpSync(staticContentDir, vitePublicStaticContent, { recursive: true });

run('vite build', sandboxSh, [
  'npx', 'vite', 'build', 'apps/static',
  '--outDir', outputDir,
  '--emptyOutDir',
], {
  MANIFEST_PATH: manifestPath,
  STATIC_BASE_PATH: '',
});

// ---------------------------------------------------------------------------
// 4. Stamp pages (inlined from apps/static/scripts/stamp-pages.ts)
// ---------------------------------------------------------------------------

console.log('--- stamp pages ---');

const templatePath = path.join(outputDir, 'index.html');
const builtManifestPath = path.join(outputDir, 'static-content', 'manifest.json');

if (!fs.existsSync(templatePath)) {
  console.error(`No index.html found at ${templatePath}. Vite build may have failed.`);
  process.exit(1);
}
if (!fs.existsSync(builtManifestPath)) {
  console.error(`No manifest.json found at ${builtManifestPath}. xml2json may have failed.`);
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf-8');
const builtManifest: { title?: string; routes: Record<string, string> } = JSON.parse(
  fs.readFileSync(builtManifestPath, 'utf-8'),
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const title = escapeHtml(builtManifest.title ?? manifest.title ?? 'Learning Observer');
let stampCount = 0;

for (const [urlPath, olxKey] of Object.entries(builtManifest.routes)) {
  const html = template
    .replace(/%OLX_KEY%/g, escapeHtml(olxKey))
    .replace(/%TITLE%/g, title);

  if (urlPath === '/') {
    fs.writeFileSync(templatePath, html);
  } else {
    const dir = path.join(outputDir, urlPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
  stampCount++;
}

console.log(`  Stamped ${stampCount} page(s).`);
console.log();

// ---------------------------------------------------------------------------
// 5. Sync images
// ---------------------------------------------------------------------------

run('sync images', sandboxSh, [
  tsxBin,
  'packages/shared/scripts/sync-images.ts',
  '--source', contentRoot,
  '--target', path.join(outputDir, 'content'),
]);

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`=== Build complete: ${outputDir} ===\n`);

// ---------------------------------------------------------------------------
// 6. Serve (optional)
// ---------------------------------------------------------------------------

if (serveFlag) {
  console.log(`Serving ${outputDir} ...\n`);
  run('serve', 'npx', ['serve', outputDir]);
}
