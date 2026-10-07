// packages/shared/scripts/records.ts
//
// The archive's command line: `snapshot`, `restore`, `doctor`.
//
// `snapshot` EXISTS BECAUSE THE WRITE GATE PROMISES IT. When the gate refuses a
// write it says "npm run records:snapshot", and an instruction that names a
// command nobody can run is worse than no instruction: it reads as a procedure
// and behaves as a dead end.
//
// `doctor` ANSWERS "WHY WON'T THIS WORK" IN ONE PLACE. The failures here are
// all remote -- no remote named, rclone absent, credentials expired, the folder
// moved -- and they surface at whatever moment the build happens to need the
// archive, worded for that moment rather than for diagnosis.
import { snapshot, seedPairs, unitsForInstall } from '@/lib/records/snapshot';
import { readManifest, manifestFingerprint } from '@/lib/records/manifest';
import { remoteFor, reachable, rcloneArgs } from '@/lib/records/remote';
import { needed, needsRestore, restoreAll, storeRootFor } from '@/lib/records/restore';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';

const say = (s: string) => console.log(s);

function units(store: string) {
  return unitsForInstall(store, needed().map(n => [n.need.kind, n.need.id] as [string, string]));
}

/** The one course whose archive this install writes to. */
function soleRemote() {
  const courses = [...new Set(needed().map(n => n.ns))];
  if (!courses.length) throw new Error('records: no course here keeps records');
  const spec = remoteFor(courses[0]);
  if (!spec) throw new Error(`records: ${courses[0]} declares no archive and none is configured`);
  return { ns: courses[0], spec };
}

function doSnapshot(): void {
  const store = storeRootFor();
  const { spec } = soleRemote();
  const u = units(store);
  say(`${u.length} unit(s) in this install's store`);
  const r = snapshot(store, spec, u, s => say(`  ${s}`));
  say(`uploaded ${r.uploaded}, rotated ${r.rotated}, unchanged ${r.unchanged}`);
  const seeded = seedPairs(store, spec, u, s => say(`  ${s}`));
  if (seeded) say(`seeded ${seeded} previous-version object(s)`);
}

function doRestore(): void {
  const store = storeRootFor();
  if (!needsRestore(store)) { say('records: nothing missing'); return; }
  const r = restoreAll(store, s => say(`  ${s}`));
  say(`restored ${r.pulled}, already present ${r.present}`);
}

function doDoctor(): void {
  const store = storeRootFor();
  say(`store          ${store}${existsSync(store) ? '' : '   (NOT PRESENT)'}`);

  let rclone = 'missing -- install rclone';
  let haveRclone = false;
  try {
    rclone = String(execFileSync('rclone', ['version'], { stdio: 'pipe' })).split('\n')[0];
    haveRclone = true;
  } catch { /* keep the message */ }
  say(`rclone         ${rclone}`);

  const ns = [...new Set(needed().map(n => n.ns))];
  say(`courses        ${ns.join(', ') || '(none keeps records)'}`);
  for (const { ns: c, need } of needed()) {
    say(`  ${c}  ${need.kind}/${need.id}${existsSync(need.dir) ? '' : '   (NOT PRESENT)'}`);
  }

  const spec = ns.length ? remoteFor(ns[0]) : null;
  if (!spec) { say('archive        NOT CONFIGURED'); return; }
  say(`archive        ${spec.path}`);
  if ((process.env.ARCHIVE_REMOTE || '').trim()) {
    say('               (from $ARCHIVE_REMOTE, overriding the configuration)');
  }
  const live = reachable(spec);
  say(`reachable      ${live.ok ? 'yes' : `NO -- ${live.why || 'no detail'}`}`);
  if (!live.ok) {
    const name = spec.path.split(':')[0];
    say('');
    // THE CAUSES NEED OPPOSITE ACTIONS, and the probes above say which it is.
    // Every one of these used to print the same "re-authorise" line: it sent
    // someone with no remote configured to a prompt for a remote that does not
    // exist, and someone with no rclone at all to a command they cannot run.
    if (!haveRclone) {
      say('  rclone is not installed, so nothing here can reach the archive.');
      say('  Install it from https://rclone.org/install/ and then run:');
      say('      rclone config          # create a remote named ' + name);
      say('  A build does NOT need it while the store is complete -- only when');
      say('  records are missing and have to be fetched.');
    } else if (/didn't find section/.test(live.why || '')) {
      say(`  rclone has no remote named "${name}". Create it with:`);
      say('      rclone config');
      say(`  and name it ${name}, or point elsewhere with $ARCHIVE_REMOTE.`);
    } else {
      say('  Most often this is an expired login rather than a wrong address.');
      say(`  Re-authorise with:  rclone config reconnect ${name}:`);
    }
    return;
  }
  let objects = '?';
  try {
    objects = String(execFileSync('rclone',
      ['size', spec.path, '--json', ...rcloneArgs(spec)], { stdio: 'pipe', timeout: 300_000 }));
    const j = JSON.parse(objects);
    say(`archive holds  ${j.count} object(s), ${(j.bytes / 1e9).toFixed(3)} GB`);
  } catch { say('archive holds  (could not be listed)'); }

  const m = readManifest(store);
  const n = Object.keys(m.units).length;
  say(`manifest       ${n} unit(s), fingerprint ${manifestFingerprint(m)}`);
  if (!n && existsSync(store)) {
    say('  A store with no manifest has never been snapshotted HERE, so the');
    say('  write gate will refuse edits to it. `records:snapshot` fixes that.');
  }
  say(`needs restore  ${needsRestore(store) ? 'YES -- run records:restore' : 'no'}`);
}

const cmd = process.argv[2];
try {
  if (cmd === 'snapshot') doSnapshot();
  else if (cmd === 'restore') doRestore();
  else if (cmd === 'doctor') doDoctor();
  else { console.error('usage: records.ts snapshot|restore|doctor'); process.exit(2); }
} catch (e) {
  console.error(String((e as Error).message || e));
  process.exit(1);
}
