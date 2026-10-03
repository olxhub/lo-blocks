#!/usr/bin/env tsx
// apps/static/scripts/build-pilot-content.ts
//
// Produces the psych *pilot* course content JSON (the "bedtime scenario"
// course) for the replay viewer.
//
// Why this exists: the pilot ran an OLDER version of the psychology course
// (bedtime scenario) that no longer exists on this branch — it was replaced by
// the child-defiance (room-cleanup) scenario in commit bfc2b71. To replay the
// pilot's sessions with the content the students actually saw, we rebuild that
// old content from git history.
//
// The pilot's deployed SHA is 86ef521, only a few commits back, so the CURRENT
// build pipeline can parse the old OLX. We:
//   1. `git archive <sha> content/sba/psychology | tar -x` into a temp dir
//      inside the repo (the file provider only allows paths under the repo, and
//      we additionally set OLX_CONTENT_DIR to the extracted dir).
//   2. Run the MCQ conversion step (convert-psych-mcq.js) that `build:content`
//      normally runs, so generated question OLX exists.
//   3. Run xml2json to emit all.json (== { idMap, ok }).
//   4. Copy all.json to the requested --out path.
//   5. Clean up the temp dir.
//
// Usage:
//   tsx apps/static/scripts/build-pilot-content.ts \
//     --sha 86ef521 --out .tmp-replay-content/psych-pilot.json
//
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

function getArg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required arg ${name}`);
  }
  return process.argv[i + 1];
}

const sha = getArg('--sha', '86ef521');
const outArg = getArg('--out');

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const contentSubdir = 'content/sba/psychology';
const outAbs = path.resolve(outArg);

const tmpDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-replay-content-'));
const contentDir = path.join(tmpDir, contentSubdir);

const sandboxSh = path.join(repoRoot, 'sandbox.sh');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');

function run(cmd: string, args: string[], env?: Record<string, string>) {
  execFileSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, ...env } });
}

try {
  console.log(`=== build-pilot-content (sha ${sha}) ===`);

  // 1. Extract the historical content into the temp dir.
  console.log(`  Extracting ${contentSubdir} @ ${sha} -> ${tmpDir}`);
  execFileSync('bash', ['-c', `git archive ${sha} ${contentSubdir} | tar -x -C ${tmpDir}`], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  // 2. Run the content-generation (MCQ conversion) step that build:content does.
  for (const q of ['operant-questions.json', 'function-questions.json']) {
    const qPath = path.join(contentDir, q);
    if (fs.existsSync(qPath)) {
      console.log(`  Converting ${q}`);
      run(sandboxSh, [tsxBin, path.join(contentDir, 'convert-psych-mcq.js'), qPath]);
    }
  }

  // 3. Minimal static.config.json for xml2json validation.
  const staticConfig = {
    title: 'Psychology Study Group (pilot)',
    eventServerUrl: false,
    classes: ['no-translanguaging'],
    routes: { '/': 'CONTENT/psych_course' },
  };
  const configPath = path.join(tmpDir, 'static.config.json');
  fs.writeFileSync(configPath, JSON.stringify(staticConfig, null, 2));

  const staticContentDir = path.join(tmpDir, 'static-content');
  fs.mkdirSync(staticContentDir, { recursive: true });

  console.log('  Running xml2json');
  run(
    sandboxSh,
    [
      tsxBin,
      'packages/shared/scripts/xml2json.ts',
      '--content', contentDir,
      '--manifest', configPath,
      '--static-dir', staticContentDir,
    ],
    // The file provider allowlists repo/content + OLX_CONTENT_DIR; point it at
    // the extracted dir so cast/chatpeg relative reads resolve.
    { OLX_CONTENT_DIR: contentDir },
  );

  // 4. Copy all.json out.
  const allJson = path.join(staticContentDir, 'all.json');
  if (!fs.existsSync(allJson)) throw new Error(`xml2json produced no all.json at ${allJson}`);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.copyFileSync(allJson, outAbs);
  console.log(`  Wrote ${outAbs}`);
} finally {
  // 5. Clean up.
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('=== done ===');
