#!/usr/bin/env tsx
// scripts/serve-static.ts
//
// Serve a previously-built static site.
//
// Usage:
//   tsx scripts/serve-static.ts --manifest content/psychology/manifest.yaml
//
// Reads the manifest to determine the output directory, then launches
// `npx serve` on that directory.
//
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import YAML from 'yaml';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const manifestFlag = getArg('--manifest');

if (!manifestFlag) {
  console.error('Usage: tsx scripts/serve-static.ts --manifest <path-to-manifest.yaml>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve output directory from manifest
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.resolve(manifestFlag);

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifestDir = path.dirname(manifestPath);
const raw = fs.readFileSync(manifestPath, 'utf-8');
const manifest: { namespace?: string; output?: string } = YAML.parse(raw);

const namespace = manifest.namespace || path.basename(manifestDir);
const outputDir = manifest.output
  ? path.resolve(repoRoot, manifest.output)
  : path.resolve(repoRoot, 'dist', namespace);

if (!fs.existsSync(outputDir)) {
  console.error(`Output directory not found: ${outputDir}`);
  console.error('Run build-static.ts first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------

console.log(`Serving ${outputDir} ...\n`);

try {
  execFileSync('npx', ['serve', outputDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
} catch (e: unknown) {
  const code = (e as { status?: number }).status ?? 1;
  process.exit(code);
}
