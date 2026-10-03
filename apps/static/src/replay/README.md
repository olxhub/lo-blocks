# Session replay review site (July 2026 pilot)

This is a session-replay review site. It was built in a short, hack-paced
sprint in July 2026 to demonstrate replay on a live pilot. It was deployed
as a static site for a small group of reviewers, who could step through
each student's work sessions against the course content the students saw.

## What this branch is

This branch is a sanitized, substantially identical copy of what ran, as a
single commit on 86ef521 (the main / pilot deploy SHA at the time). It
differs from the sprint branch tip that was actually deployed (445e829c,
kept locally as the historical record) in exactly four files, all
publication changes: this README; `parseLog.test.ts`, which read a
never-committed local log and now uses a synthetic one; and neutral test
user ids (`testuser`) in `build-replay-index.test.ts` and
`responses.test.ts`. No non-test code was changed.

- `git diff 445e829c HEAD --stat` lists only those four files.
- `git diff 86ef521 HEAD` shows everything the sprint changed relative to
  main at the time, including the course content deployed with it.

## Pieces

- `replay.html` + `src/replay.tsx` — second Vite entry in `apps/static`.
- `ReplayViewer.tsx` — run -> student -> session viewer with hash routing
  (`#/<run>/<student>/<session>`). Renders the course read-only against a
  store frozen at the scrub position.
- `SessionScrubber.tsx` — frame scrubber with an Events/Time axis toggle
  and long-pause markers.
- `parseLog.ts` — browser-safe NDJSON log parsing (gzip via
  DecompressionStream); drops `save_blob` from replay.
- `sessions.ts` — merges a student's connection logs into one stream,
  splits it into work sessions on inactivity gaps, and computes
  time-on-task (active time, with long gaps capped).
- `responses.ts` / `replayResponses.ts` — replays each student to final
  state and writes `responses.csv` (one row per student) and
  `sessions.csv` (one row per work session).
- `replayIndex.ts` — browser loaders for the `replay-data/` payload.
- `apps/static/scripts/build-replay-index.ts` — build-time script that
  turns directories of event logs into `replay-data/` (runs.json, per-run
  index.json, content.json, merged logs, CSVs).
- `apps/static/scripts/build-pilot-content.ts` — rebuilds an older course
  version from git history so a run can replay against its own content.
- `packages/shared/scripts/replay.ts --blob <file>` — headless replay that
  diffs replayed state against a stored state blob (used to validate that
  replay reconstructs what students saved).

## Build and run

Event logs are student data. They are supplied at build time and land only
in `dist/` (gitignored). Never commit them.

```
npm install
# Course site + viewer shell -> dist/psych-defiance/ (also emits replay.html)
npx tsx scripts/build-static.ts --manifest content/sba/psychology/manifest.yaml
# Optional: content for a run that used an older course version
npx tsx apps/static/scripts/build-pilot-content.ts --sha 86ef521 \
  --out .tmp-replay-content/psych-pilot.json
# Bake replay data (repeat --run/--events/--content per run; --label and
# --fields a,b,c are optional per run)
npx tsx apps/static/scripts/build-replay-index.ts --out dist/psych-defiance \
  --run psych-defiance --events <log dir> \
    --content dist/psych-defiance/static-content/all.json \
  --run psych-pilot --events <log dir> \
    --content .tmp-replay-content/psych-pilot.json
```

Serve `dist/psych-defiance/` as static files; the viewer is at `/`
(also `/replay/`). Tests: `npx vitest run apps/static`.

## Hacks and security caveats — read before reusing any of this

This was built in days, for one deployment, for a handful of reviewers who
all trusted each other, behind hosting-layer HTTP Basic auth. Those
conditions did the security work; the code does not. It is NOT reusable
tooling as it stands.

- **The output is a static site full of student data with no
  application-level auth.** `replay-data/` holds real user ids, timestamps,
  complete event streams, written responses, and CSV exports. The payload
  is gitignored and never committed, but any deployment is only as safe as
  the access control in front of it. Treat the built `dist/` as sensitive
  data, not as a website.
- **Shell injection in `build-pilot-content.ts`** (`execFileSync('bash',
  ['-c', `git archive ${sha} ...`])`): the `--sha` argument is interpolated
  into a shell string. Local-operator-only, but validate the revision and
  pass arguments without a shell before reusing.
- **Path traversal in `build-replay-index.ts`**: the `--run` id is used,
  unvalidated, in output paths. A malicious or mistyped run id can write
  outside the intended directory.
- **CSV exports are quoted but not formula-neutralized.** A response
  beginning with `=`, `+`, `-`, or `@` is executed as a formula by Excel
  and similar programs when the CSV is opened. Prefix such cells (e.g.
  with `'`) before sharing exports with anyone.
- **Student ids can collide after filename sanitization**, so two
  students' replay logs can overwrite each other in the baked payload.
- Time-on-task, pause detection, and session splitting use fixed
  thresholds chosen by eye against one pilot; they are heuristics, not
  validated measures.

## Known limitations

- `DEFAULT_RESPONSE_FIELDS` in `responses.ts` is specific to this course.
  Other courses must pass `--fields`.
- `build-pilot-content.ts` hardcodes a content SHA and the path
  `content/sba/psychology`, which no longer exist on main.
- This branch forks far behind main and is NOT mergeable as-is. It is
  preserved as a reference for a future port.
