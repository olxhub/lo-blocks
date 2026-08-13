#!/usr/bin/env node
// packages/shared/scripts/olx_string_idmaps.ts
//
// Parse OLX *strings* (not files) into idMaps, using lo-blocks' own parser.
//
// This is the companion to xml2json.ts for dynamic, runtime-authored OLX: the
// content an OlxSlot renders from a student- or LLM-authored string (see
// OlxSlot/_OlxSlot.tsx, which calls parseOLX on the slot's target value). That
// content never lives in the content/ tree, so xml2json never sees it; this
// script parses the captured string instead, with the SAME parser, namespace,
// and provenance the runtime OlxSlot uses -- so the ids it mints
// ('<ns>/student_sequence', the auto-assigned '<ns>/_<hash>' children, ...)
// match the runtime ids the event stream carries.
//
// Usage:
//   npx tsx packages/shared/scripts/olx_string_idmaps.ts --jobs <jobs.json> --out <out.json>
//
// Input (--jobs): a JSON object mapping an arbitrary key (the caller's content
// hash) to { ns, olx }:
//   { "<key>": { "ns": "demos", "olx": "<Sequential ...>...</Sequential>" }, ... }
//
// Output (--out): a JSON object mapping each key to its parse result:
//   { "<key>": { "idMap": {...}, "root": "<ns>/...", "errorCount": N }, ... }
// A job whose OLX fails to parse (mid-edit/invalid) is omitted from the output,
// so the caller simply finds no maps for it and falls back to no resolution.

import fs from 'fs';
import path from 'path';

import { parseOLX } from '../lib/content/parseOLX';
import { toLofsRef } from '../lib/types/address';
import { parseContentNamespace } from '../lib/types/id-grammar';

const args = process.argv.slice(2);
function getArgOptional(flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

async function main() {
  const jobsFile = getArgOptional('--jobs');
  const outFile = getArgOptional('--out');
  if (!jobsFile || !outFile) {
    console.error('Usage: olx_string_idmaps.ts --jobs <jobs.json> --out <out.json>');
    process.exit(2);
  }

  let jobs: Record<string, { ns: string; olx: string }>;
  try {
    jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
  } catch (err: any) {
    console.error(`Could not read jobs file ${jobsFile}: ${err.message}`);
    process.exit(2);
    return;
  }

  const results: Record<string, { idMap: any; root: string; errorCount: number }> = {};
  for (const [key, job] of Object.entries(jobs)) {
    if (!job || typeof job.olx !== 'string' || typeof job.ns !== 'string') continue;
    let ns;
    try {
      ns = parseContentNamespace(job.ns);
    } catch {
      continue; // a namespace the grammar rejects can't have produced runtime ids
    }
    try {
      // Mirror _OlxSlot.tsx exactly: parseOLX(candidate, [toLofsRef('validate://')],
      // undefined, ns). The undefined provider matches the runtime (no cross-file
      // <Use> resolution for dynamic OLX); same provenance, same namespace.
      const result = await parseOLX(job.olx, [toLofsRef('validate://')], undefined, ns);
      // Accept any parse that yielded a root and a populated idMap. We don't gate
      // on errors.length===0: the caller sources these strings from the OlxSlot's
      // own `validOlx` field, which the runtime only ever sets once its parse was
      // error-free (see _OlxSlot.tsx), so a non-empty idMap here is structurally
      // complete even if a residual content warning (e.g. inline markup in a
      // <Markdown> body) lands in `errors`. errorCount is reported for diagnostics.
      if (result.root && result.idMap && Object.keys(result.idMap).length > 0) {
        results[key] = {
          idMap: result.idMap,
          root: result.root,
          errorCount: result.errors?.length ?? 0,
        };
      }
    } catch {
      // Unparseable string (mid-edit, malformed): skip it.
    }
  }

  const outDir = path.dirname(path.resolve(outFile));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results));
  console.error(`Parsed ${Object.keys(results).length}/${Object.keys(jobs).length} OLX string(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err?.message ?? err);
  process.exit(2);
});
