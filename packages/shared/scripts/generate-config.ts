#!/usr/bin/env tsx
// packages/shared/scripts/generate-config.ts
//
// Reads config/system.pmss and generates packages/shared/lib/config.generated.ts.
// The generated file exports the PMSS string so config.ts can import it without
// file I/O (works in 'use client' modules, SSR, tests, etc.).
//
// Same pattern as generate-parser-registry.ts and generateBlockRegistry.js.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SYSTEM_PMSS_PATH = path.join(ROOT, 'config/system.pmss');
const OUTPUT_PATH = path.join(ROOT, 'packages/shared/lib/config.generated.ts');

const pmssContent = fs.readFileSync(SYSTEM_PMSS_PATH, 'utf-8');

const output = `// Auto-generated from config/system.pmss — do not edit directly.
// Regenerate: npm run build:config (or npm run build)
export const SYSTEM_PMSS = ${JSON.stringify(pmssContent)};
`;

fs.writeFileSync(OUTPUT_PATH, output);
console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} from ${path.relative(ROOT, SYSTEM_PMSS_PATH)}`);
