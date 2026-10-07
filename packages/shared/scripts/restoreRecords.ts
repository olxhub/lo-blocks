// packages/shared/scripts/restoreRecords.ts
//
// The build's first step: make sure this install's records are on disk.
//
// IT IS A NO-OP ON A MACHINE THAT ALREADY HAS THEM, and says nothing when it
// has nothing to do -- a build that printed a paragraph about the archive on
// every run would train everyone to stop reading its output.
//
// IT DOES NOT TOUCH THE NETWORK UNLESS SOMETHING IS MISSING. Builds must work
// offline wherever they can work at all; see `needsRestore`.
//
// WHEN RECORDS ARE MISSING AND THE ARCHIVE CANNOT BE REACHED, IT FAILS THE
// BUILD. The alternative -- carrying on with an empty store -- produces a build
// that measures nothing and reports it as a result, which is the single failure
// this archive exists to prevent.
// IT RUNS OUTSIDE sandbox.sh, alone among the build steps. It is the one step
// that must reach the network and read the archive credentials; a sandbox tight
// enough to be worth having would deny it both.
import { needsRestore, restoreAll, storeRootFor, needed } from '@/lib/records/restore';

function main(): void {
  let store: string;
  try {
    store = storeRootFor();
  } catch (e) {
    // No lo-blocks root means no store location, which is not this script's
    // problem to diagnose -- whatever runs next will say so far better.
    return;
  }
  if (!needed().length) return;          // no course here keeps records
  if (!needsRestore(store)) return;

  console.log('restoreRecords: records are missing; pulling them from the archive');
  const r = restoreAll(store, s => console.log(`  ${s}`));
  for (const d of r.created) console.log(`  created ${d}`);
  console.log(`restoreRecords: ${r.pulled} object(s) restored, ${r.present} already present`);
}

main();
