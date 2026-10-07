// packages/shared/lib/records/required.ts
//
// What must EXIST in a course's record store, and what to do when it does not.
//
// A course's store is not only the material someone wrote. Some of it is
// bookkeeping the machinery keeps about the course -- which strings were
// probed, which leakage findings were reviewed, which design shas are of
// record -- and a course that has never been scored has none of it yet. Those
// files are missing in exactly the same way on a brand-new course and on an
// established one whose store lost a file, and until now both were a build
// failure naming a path.
//
// THE POLICY IS PER FILE, AND EACH ENTRY SAYS WHY INVENTING IT IS SAFE.
//
//   empty    A well-formed empty file. Safe only where EMPTINESS MEANS WHAT IT
//            SAYS -- "no probes have been run" is a true statement about a new
//            course, and a false one that something downstream will catch about
//            an old course.
//   compose  Empty, but not `{}`: the file has a declared shape, and half of it
//            is the `_README` that tells the next reader what it is for. An
//            empty file that cannot explain itself is how a ledger becomes
//            mysterious.
//   derive   Written from something that already exists -- the namespace, the
//            rubric id. A starting document, not a blank one.
//
// THE TABLE IS A WHITELIST, AND ITS ABSENCES ARE THE POLICY FOR EVERYTHING
// ELSE. A file not listed here is never invented: if it is missing and the
// archive has not got it, the build fails on it exactly as it did before. That
// is the right default for anything a person has to write, and it is why there
// is no 'cannot be invented' policy kind -- it would be a branch with no
// members, which reads like a rule being enforced and enforces nothing.
//
// NOTHING HERE MAY RUN BEFORE A RESTORE. See `materialise`.
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export type Policy = 'empty' | 'compose' | 'derive';

export interface Ctx { ns: string; instrumentId: string; rubricId: string; }

export interface RequiredFile {
  where: 'instrument' | 'rubric';
  /** Path relative to that directory. */
  rel: string;
  policy: Policy;
  /** The content to write when the file is absent. */
  content: (c: Ctx) => string;
  /** Why a created one is honest. Stated per entry; never assumed. */
  because: string;
}

const json = (v: unknown) => JSON.stringify(v, null, 1) + '\n';

export const REQUIRED: RequiredFile[] = [
  {
    where: 'instrument', rel: 'corpus_refs.json', policy: 'empty',
    content: () => json({}),
    because:
      'An empty index says "no spans have been exported", which is true of a new '
      + 'instrument. It cannot pass off missing data as "no references": the build '
      + 'resolves every {{corpus:...}} against this file and refuses the ones it '
      + 'cannot find, so an empty index under a handout that cites spans fails '
      + 'loudly rather than rendering a course with its quotations silently gone.',
  },
  {
    where: 'rubric', rel: 'PROBED.json', policy: 'empty',
    content: () => json([]),
    because:
      'The list of questions asked of the grader standalone. A course that has '
      + 'never been probed has asked none, and the checks that read it ask whether '
      + 'a PARTICULAR string was probed -- an empty list answers no, correctly.',
  },
  {
    where: 'rubric', rel: 'LEAKAGE_REVIEWED.json', policy: 'empty',
    content: () => json({}),
    because:
      'Findings a human has reviewed, keyed by finding. None reviewed is the '
      + 'correct and SAFE answer for a new course: every finding then counts as '
      + 'outstanding, which is the direction that stops a sweep rather than '
      + 'waving it through.',
  },
  {
    where: 'rubric', rel: 'PROBE_RECEIPTS.json', policy: 'compose',
    content: () => json({
      receipts: [],
      _README:
        'Probes that were run, and the sha of the string each one ASKED. '
        + 'enforcement.check_probe_receipts_match_shipping() refuses a sweep whose '
        + 'probe measured text that no longer ships. Written by '
        + 'probe.write_receipt(); never hand-edited.',
    }),
    because:
      'Shaped, not blank: `receipts` is the ledger and `_README` is what makes it '
      + 'legible to whoever opens it next. No receipts is true of a course that '
      + 'has run no probes, and the check it feeds refuses a sweep whose probe is '
      + 'missing -- so an empty ledger withholds permission rather than granting it.',
  },
  {
    where: 'rubric', rel: 'DESIGNED_TEXT_SHA.json', policy: 'compose',
    content: () => json({
      _README:
        'THE DESIGN OF RECORD for every rubric desc/rule the graders read. One sha '
        + 'per (item|slot|field) over whitespace-normalised text. A field absent '
        + 'from `fields` has no design of record yet and must be registered with '
        + 'its build, never before it.',
      fields: {},
    }),
    because:
      'No field is of record until someone registers it with its build, so an '
      + 'empty `fields` is the honest starting state. Seeding it from whatever '
      + 'text happened to ship would declare an unreviewed string to be the '
      + 'design -- the one thing this ledger exists to prevent.',
  },
  {
    where: 'rubric', rel: 'CHANGELOG.md', policy: 'derive',
    content: (c) =>
      `# ${c.ns} — scoring changelog\n`
      + '\n'
      + '**What this file is for.** Every change to the text the graders read, with\n'
      + 'the reason it was made and what was measured before and after. A scoring\n'
      + 'change with no entry here is a change nobody can review later.\n'
      + '\n'
      + `Rubric: \`${c.rubricId}\`  ·  Instrument: \`${c.instrumentId}\`\n`
      + '\n'
      + '## Entries\n'
      + '\n'
      + '_No entries yet._\n',
    because:
      'A starting document rather than a blank file: it names the course, its '
      + 'rubric and its instrument, and says what belongs in it. The alternative '
      + 'is an empty file that the first person to open it has to guess the '
      + 'purpose of.',
  },
];

/** Where an entry lands, given the two store directories. */
export function pathOf(f: RequiredFile, instrumentDir: string, rubricDir: string): string {
  return join(f.where === 'instrument' ? instrumentDir : rubricDir, f.rel);
}

export interface Missing { file: RequiredFile; path: string; }

/** Entries with no file on disk. */
export function missing(instrumentDir: string, rubricDir: string): Missing[] {
  return REQUIRED
    .map(file => ({ file, path: pathOf(file, instrumentDir, rubricDir) }))
    .filter(({ path }) => !existsSync(path));
}

export interface Made { path: string; policy: Policy; }

/**
 * Create what is missing, and say so.
 *
 * IT MUST RUN AFTER A RESTORE, NEVER BEFORE. Restore extracts with
 * --keep-old-files, so a placeholder written first would be preserved and the
 * real archived file silently dropped -- a course's design ledger replaced by
 * an empty one, with a build that passed. Running second also makes the test
 * cheap and exact: restore has already pulled everything the archive holds for
 * this course, so a file still absent afterwards is absent from the archive
 * too, and no second remote listing is needed to establish it.
 *
 * IT REPORTS EVERY FILE IT MAKES. Creating a ledger in silence is how a course
 * would quietly acquire a blank design record and nobody would learn of it
 * until the record was needed.
 */
export function materialise(ctx: Ctx, instrumentDir: string, rubricDir: string,
                            log: (s: string) => void = () => {}): Made[] {
  const gaps = missing(instrumentDir, rubricDir);
  const made: Made[] = [];
  for (const { file, path } of gaps) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content(ctx));
    log(`created ${path} (${file.policy})`);
    made.push({ path, policy: file.policy });
  }
  return made;
}
