#!/usr/bin/env node
// packages/shared/scripts/translate.ts
//
// Translate content files (OLX, PEG-based) via LLM.
// No running server required — calls the translation module directly.
//
// Usage:
//   npx tsx packages/shared/scripts/translate.ts <file> [<file>...] --langs pl,ar,es
//   npx tsx packages/shared/scripts/translate.ts content/demos/postcard-demo.olx --langs pl
//   npx tsx packages/shared/scripts/translate.ts content/demos/*.olx --langs ar,zh-Hans --out out/
//
// Flags:
//   --langs <codes>        Comma-separated target locales (required)
//   --source-locale <code> Source locale (default: read from file frontmatter, or 'en')
//   --out <dir>            Output directory (default: <basename>/<locale>.auto.<ext> alongside source)
//   --grammar <file>       PEG grammar file for PEG-based formats (auto-detected from extension)

import fs from 'fs';
import path from 'path';
import { loadServerConfig } from '../lib/config';
import { translateContent, detectFileType } from '../lib/translate';
import { extractLeadingComments, parseMetadataFromComments } from '../lib/translate/metadata';

// --- PMSS bootstrap (needed for LLM provider resolution) ---
loadServerConfig(fs.readFileSync);

// --- CLI arg parsing ---

const args = process.argv.slice(2);

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

const langArg = getFlag('--langs');
if (!langArg) {
  console.error('Usage: translate.ts <file> [<file>...] --langs pl,ar,es [--out <dir>]');
  process.exit(1);
}

const targetLocales = langArg.split(',').map(s => s.trim()).filter(Boolean);
const sourceLocaleOverride = getFlag('--source-locale');
const outDir = getFlag('--out');
const grammarFileOverride = getFlag('--grammar');

// Collect input files (everything that's not a flag)
const flagSet = new Set(['--langs', '--source-locale', '--out', '--grammar']);
const inputFiles: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (flagSet.has(args[i])) { i++; continue; } // skip flag + value
  inputFiles.push(args[i]);
}

if (inputFiles.length === 0) {
  console.error('No input files specified.');
  process.exit(1);
}

// --- Grammar loading ---

// Use the generated registry to find grammar files by extension
import { grammarInfo } from '../generated/parserRegistry';

function loadGrammar(fileType: string): string | undefined {
  if (grammarFileOverride) {
    return fs.readFileSync(grammarFileOverride, 'utf-8');
  }
  const info = grammarInfo[fileType as keyof typeof grammarInfo];
  if (!info) return undefined;
  // Convert @/foo to packages/shared/foo for filesystem access
  const dir = info.grammarDir.replace(/^@\//, 'packages/shared/');
  const grammarPath = path.join(dir, `${info.grammarName}.pegjs`);
  try {
    return fs.readFileSync(grammarPath, 'utf-8');
  } catch {
    console.warn(`Warning: could not load grammar for ${fileType} from ${grammarPath}`);
    return undefined;
  }
}

// --- Source locale detection from frontmatter ---

function detectSourceLocale(content: string): string {
  if (sourceLocaleOverride) return sourceLocaleOverride;
  const { comments } = extractLeadingComments(content);
  const meta = parseMetadataFromComments(comments);
  return meta.lang || 'en';
}

// --- Main ---

const logsDir = path.resolve('logs');

async function translateFile(filePath: string): Promise<{ successes: number; failures: number }> {
  const absPath = path.resolve(filePath);
  const sourceContent = fs.readFileSync(absPath, 'utf-8');
  const fileType = detectFileType(absPath);
  const sourceLocale = detectSourceLocale(sourceContent);
  const sourceFileName = path.basename(absPath);
  const grammar = loadGrammar(fileType);

  // Extract category from source frontmatter
  const { comments } = extractLeadingComments(sourceContent);
  const meta = parseMetadataFromComments(comments);
  const sourceCategory = meta.category;

  let successes = 0;
  let failures = 0;

  for (const targetLocale of targetLocales) {
    const label = `${sourceFileName} → ${targetLocale}`;
    console.log(`Translating ${label}...`);

    const result = await translateContent({
      sourceContent,
      fileType,
      sourceLocale,
      targetLocale,
      sourceFileName,
      sourceCategory,
      grammar,
      logsDir,
    });

    if (!result.ok) {
      console.error(`  FAILED: ${result.error}`);
      failures++;
      continue;
    }

    // Compute output path
    let outputPath: string;
    if (outDir) {
      const baseName = path.basename(absPath, path.extname(absPath));
      outputPath = path.join(outDir, baseName, `${targetLocale}.auto${path.extname(absPath)}`);
    } else {
      const baseName = path.basename(absPath, path.extname(absPath));
      const dir = path.dirname(absPath);
      outputPath = path.join(dir, baseName, `${targetLocale}.auto${path.extname(absPath)}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.content);
    console.log(`  OK → ${path.relative(process.cwd(), outputPath)}`);
    successes++;
  }

  return { successes, failures };
}

async function main() {
  let totalSuccesses = 0;
  let totalFailures = 0;

  for (const file of inputFiles) {
    const { successes, failures } = await translateFile(file);
    totalSuccesses += successes;
    totalFailures += failures;
  }

  console.log(`\nDone: ${totalSuccesses} succeeded, ${totalFailures} failed.`);
  process.exit(totalFailures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
