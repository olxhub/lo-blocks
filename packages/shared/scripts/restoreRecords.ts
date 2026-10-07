// packages/shared/scripts/restoreRecords.ts
//
// The build's first step: make sure this install's records are on disk.
//
// THREE THINGS IN ONE ORDER, AND THE ORDER IS THE POINT.
//
//   1. RESTORE what the archive holds. Anything it has is the real thing and
//      must land before anything else looks at the tree.
//   2. CREATE what must exist and the archive does not have -- the starting
//      ledgers of a course that has not been scored yet. Doing this second is
//      what makes it safe: restore extracts with --keep-old-files, so a file
//      written first would be kept and the archived one silently dropped.
//   3. ARCHIVE what was just created, because the write gate refuses to
//      overwrite a file with no archived copy. A course that started here and
//      could not then be edited would be a worse state than the one we fixed.
//
// IT IS A NO-OP ON A MACHINE THAT ALREADY HAS EVERYTHING, and says nothing when
// it has nothing to do -- a build that printed a paragraph about the archive on
// every run would train everyone to stop reading its output.
//
// IT DOES NOT TOUCH THE NETWORK UNLESS SOMETHING IS MISSING. Builds must work
// offline wherever they can work at all; see `needsRestore`.
//
// WHEN RECORDS ARE MISSING AND THE ARCHIVE CANNOT BE REACHED, IT FAILS THE
// BUILD. The alternative -- carrying on with an empty store -- produces a build
// that measures nothing and reports it as a result, which is the single failure
// this archive exists to prevent.
//
// IT RUNS OUTSIDE sandbox.sh, alone among the build steps. It is the one step
// that must reach the network and read the archive credentials; a sandbox tight
// enough to be worth having would deny it both.
import { needsRestore, restoreAll, storeRootFor, needed, passes }
  from '@/lib/records/restore';
import { materialise, type Made } from '@/lib/records/required';
import { snapshot, unitsForInstall } from '@/lib/records/snapshot';
import { remoteFor } from '@/lib/records/remote';

function main(): void {
  let store: string;
  try {
    store = storeRootFor();
  } catch {
    // No lo-blocks root means no store location, which is not this script's
    // problem to diagnose -- whatever runs next will say so far better.
    return;
  }
  const want = needed();
  if (!want.length) return;              // no course here keeps records
  if (!needsRestore(store)) return;

  console.log('restoreRecords: records are missing; consulting the archive');
  const r = restoreAll(store, s => console.log(`  ${s}`));
  for (const d of r.created) console.log(`  created ${d}`);
  console.log(`restoreRecords: ${r.pulled} object(s) restored, ${r.present} already present`);
  for (const p of r.fresh) console.log(`  ${p} has no records yet; starting it`);

  // WHAT THE ARCHIVE DOES NOT HAVE, THIS COURSE HAS NEVER HAD.
  //
  // PER RUBRIC, because the ledgers are the RUBRIC's and a course may carry
  // several. Scaffolding per namespace would create one rubric's starting files
  // and leave the others' missing -- and the ids come from the pass rather than
  // from `scoringId(ns, ...)`, which cannot answer for a course with more than
  // one rubric unless it is told which.
  const made: Made[] = [];
  const courses = [...new Set(want.map(n => n.ns))];
  for (const p of passes()) {
    const ctx = { ns: p.ns, instrumentId: p.instrument.id, rubricId: p.rubric.id };
    made.push(...materialise(ctx, p.instrument.dir, p.rubric.dir,
                             s => console.log(`  ${s}`)));
  }
  if (!made.length) return;

  console.log(`restoreRecords: created ${made.length} starting file(s); archiving them`);
  const spec = remoteFor(courses[0]);
  if (!spec) {
    throw new Error('records: starting files were created and there is no archive '
      + 'to put them in, so nothing could be edited afterwards. Configure '
      + 'archive-remote, or set $ARCHIVE_REMOTE.');
  }
  const units = unitsForInstall(store, want.map(n => [n.need.kind, n.need.id] as [string, string]));
  const keys = new Set(made.map(m => m.path));
  const fresh = units.filter(u => keys.has(u.source));
  const s = snapshot(store, spec, fresh, m => console.log(`  ${m}`));
  console.log(`restoreRecords: archived ${s.uploaded} starting file(s)`);
}

main();
