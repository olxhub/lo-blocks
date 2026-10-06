// Reaching $COURSE_DATA and $COURSE_METADATA from lo-blocks.
//
// THE DISCIPLINE IS `resolveCorpusRefs.corpusDataPath`'s, because this is the
// same problem. That function expands `$COURSE_DATA` out of an .olx file's own
// `corpus_data:` frontmatter and THROWS when the variable is not set — it does
// not hardcode a path and it does not default. Everything here follows it: the
// location is supplied, never assumed, and an unset variable is a refusal.
//
// WHY THIS EXISTS AT ALL. Goal K's first classification said measurement and
// declaration tables were python's by nature. That was wrong, and the user
// corrected it: what decides is whether the CONTROL FLOW is generic, not whose
// data it touches. A check that reads run artifacts and asks "did this run
// judge anything?" is generic for any course whose grader is `SlotSheetGrader`;
// only the data is this course's. So the data comes from $COURSE_DATA, the
// declarations from $COURSE_METADATA, and the rule lives here.
//
// A REFUSAL IS NOT A FINDING OF ZERO. Every failure path throws, so a caller
// cannot mistake "I could not read the corpus" for "the corpus is clean" —
// which is the single failure mode every rule in this package is written
// against.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolve, sep } from 'path';

// THE COURSE'S OWN DECLARATION, read the same way python reads it.
//
// Each course declares its roots in its own rubric's frontmatter, beside the
// `corpus_data:` line that already names a file within one of them:
//
//     course_data: ~/molly_data
//     course_metadata: ./course_metadata
//
// BOTH SIDES READ THE SAME DECLARATION; NEITHER TELLS THE OTHER. `paths.py`
// resolves it too. The obvious shortcut — have python pass its answer across —
// would make lo-blocks depend on python to know where a course lives, and
// lo-blocks must never depend on python.
//
// RESOLUTION IS PER COURSE, which is the whole point. One repository will hold
// several courses, and a single global `$COURSE_DATA` cannot name two courses'
// data at once. So every caller says WHICH course, and the answer comes from
// that course's own rubric. Tested against a second course mounted beside the
// first: before this, the resolver returned whichever it happened to read
// first, and with one course that is invisible.

/** The lo-blocks root: the only directory holding BOTH package.json and content/. */
export function loBlocksRoot(): string | null {
  // NOT "a directory named content". `packages/shared/lib/content` is a SOURCE
  // directory and the walk-up found it first, so the course mount was never
  // seen at all. Nor "the nearest package.json": `packages/shared` has one.
  // The PAIR is unique to the root.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'package.json')) &&
        existsSync(resolve(dir, 'content'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** Every course namespace mounted under content/. */
export function mountedCourses(): string[] {
  const root = loBlocksRoot();
  if (!root) return [];
  try {
    return readdirSync(resolve(root, 'content'), { withFileTypes: true })
      .filter(d => (d.isDirectory() || d.isSymbolicLink()) && d.name.includes('.'))
      .map(d => d.name).sort();
  } catch {
    return [];
  }
}

// DISCOVERY IS MEMOISED PER NAMESPACE. Finding the rubric means walking the
// mounted course, and every accessor below starts there: `collectionDir`,
// `courseLocation`, `rubricDir`, `instrumentDir`, `outDir`, `scoringId` and
// every record path built from them. Seventy rules asking a few times each is
// thousands of walks of the same unchanged tree.
//
// IT BECAME MEASURABLE when a course put its data store inside its own
// repository: the mount then contains the store, one walk went from trivial
// to ~30 ms, and the payload test that had taken about a second took over
// seventy and timed out. The walk itself is correct -- doing it once is what
// was missing.
//
// A PROCESS SEES ONE TREE. These caches are not invalidated because nothing in
// a run moves a rubric; a test that mutates the layout must clear them, which
// is what `__resetCourseDataCaches` is for.
const _rubricFileCache = new Map<string, string | null>();
const _collectionDirCache = new Map<string, string | null>();

/** Drop the memoised discovery, for a test that moves files under us. */
export function __resetCourseDataCaches(): void {
  _rubricFileCache.clear();
  _collectionDirCache.clear();
}

/**
 * The namespace a CONTENT COLLECTION declares about itself, or null.
 *
 * Asked of a DIRECTORY rather than of a namespace, which is what lets
 * `rubricFile` tell two courses' collections apart before it knows which
 * course it is looking at. Python's `_collection_namespace` is its twin, and
 * reads the same `manifest.yaml` key.
 *
 * DELIBERATELY NOT A YAML PARSER, for the reason `collectionDeclares` gives:
 * these are flat `key: value` lines, and a value this misses reads as
 * undeclared, which is the same answer as a missing key and is safe.
 */
function collectionNamespace(dir: string): string | null {
  try {
    const text = readFileSync(resolve(dir, 'manifest.yaml'), 'utf8');
    const m = /^namespace:\s*(\S+)\s*$/m.exec(text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * The CONTENT COLLECTION a course's material sits in, found without naming it.
 *
 * `content/<ns>` is the course repository; the `.olx` live one level inside it,
 * in a collection directory that may hold more than one course's material. That
 * directory's name was the literal `'psychology'` here and in three places in
 * `native.ts` -- this course's directory name, in engine code, which is exactly
 * what `declaredRoot` below exists to stop being true of its data roots. The
 * user's instruction, 2026-09-25: *"We need to standardize on the engines not
 * assuming the name of the directory that content lives in."*
 *
 * FOUND BY SHAPE, the same bootstrap python's `paths._rubric_file` uses and for
 * the same reason: every declaration lives in the rubric's frontmatter, so
 * something has to locate the rubric before any declaration can be read, and
 * what that something can do is refuse to spell a course's directory name.
 */
export function collectionDir(ns: string): string | null {
  const hit = _collectionDirCache.get(ns);
  if (hit !== undefined) return hit;
  const found = _collectionDirUncached(ns);
  _collectionDirCache.set(ns, found);
  return found;
}

function _collectionDirUncached(ns: string): string | null {
  const rubric = rubricFile(ns);
  if (!rubric) return null;
  // THE NEAREST MANIFEST IS WHAT MAKES A DIRECTORY A COLLECTION. This used to
  // be the directory one level under the mount that DIRECTLY held a
  // `*_rubric.olx`, which is a depth assumption -- true only while a course
  // keeps its material loose in the collection. When this course was given a
  // folder of its own on 2026-09-26 no immediate child qualified, this
  // returned null, and every id derived from it silently fell back to the
  // NAMESPACE: `scoringId` answered `edu.memphis.psych` where it had answered
  // `bmod`, which is the collection standing in for the rubric again -- the
  // exact confusion `scoringId` exists to end. Python's `_collection_dir`
  // makes the same move for the same reason.
  let d = dirname(rubric);
  for (;;) {
    if (existsSync(resolve(d, 'manifest.yaml'))) return d;
    const up = dirname(d);
    if (up === d) return dirname(rubric);      // no manifest anywhere above
    d = up;
  }
}

/**
 * The course's OWN folder: the directory its rubric sits in.
 *
 * PYTHON'S `COURSE_LOCATION`, and the thing several readers here meant when
 * they said `collectionDir`. A collection may hold more than one course, so a
 * course's `.olx` are addressed relative to its own folder; joining a handout
 * filename onto the COLLECTION worked only while the two were the same
 * directory.
 */
export function courseLocation(ns: string): string | null {
  const rubric = rubricFile(ns);
  return rubric ? dirname(rubric) : null;
}

/**
 * Every `*_rubric.olx` under a mounted course, at ANY depth.
 *
 * PRUNED to directories that are never course material anywhere -- version
 * control, dependencies, bytecode, the build stage. A staged copy is the same
 * rubric found at its source, and returning it would make every root resolve
 * inside the build output.
 */
function rubricsUnder(dir: string): string[] {
  const PRUNE = new Set(['.git', '.hg', '.svn', 'node_modules', '__pycache__',
                         '.stage', '.venv', 'venv', '.tox']);
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;                                 // vanished or unreadable: not an error
  }
  for (const e of entries) {
    if (e.isDirectory() || e.isSymbolicLink()) {
      if (PRUNE.has(e.name)) continue;
      out.push(...rubricsUnder(resolve(dir, e.name)));
    } else if (e.name.endsWith('_rubric.olx')) {
      out.push(resolve(dir, e.name));
    }
  }
  return out;
}

/**
 * A course's rubric component, by SHAPE -- never by filename.
 *
 * ONE PER COLLECTION, and more than one is a refusal for the same reason
 * `collectionDir` refuses: a rubric chosen by sort order is a course chosen by
 * sort order.
 */
export function rubricFile(ns: string): string | null {
  const hit = _rubricFileCache.get(ns);
  if (hit !== undefined) return hit;
  const found = _rubricFileUncached(ns);
  _rubricFileCache.set(ns, found);
  return found;
}

function _rubricFileUncached(ns: string): string | null {
  const root = loBlocksRoot();
  if (!root) return null;
  // AT ANY DEPTH, and this is now the primary lookup rather than something
  // `collectionDir` gates: the rubric is what is found by shape, and every
  // other root is derived FROM it. That is the order python's bootstrap uses,
  // and having the two sides agree about where a course IS is the point of
  // both.
  const found = rubricsUnder(resolve(root, 'content', ns)).sort();
  if (found.length === 0) return null;
  if (found.length === 1) return found[0];
  // NOT FIRST-MATCH. A rubric chosen by sort order is a course chosen by sort
  // order, and that does not fail -- it succeeds, on the wrong course. Each
  // collection declares its namespace in the `manifest.yaml` above the rubric,
  // exactly as python's `_collection_namespace` reads it.
  const matched = found.filter(f => collectionNamespace(nearestManifestDir(f)) === ns);
  if (matched.length === 1) return matched[0];
  throw new Error(
    `enforce/courseData: content/${ns} holds ${found.length} rubrics ` +
    `(${found.join(', ')}) and ${matched.length} declare the namespace ` +
    `${ns}. Refusing to pick one -- a rubric chosen by sort order is a ` +
    `course chosen by sort order.`);
}

/** The directory of the nearest `manifest.yaml` at or above a file. */
function nearestManifestDir(file: string): string {
  let d = dirname(file);
  for (;;) {
    if (existsSync(resolve(d, 'manifest.yaml'))) return d;
    const up = dirname(d);
    if (up === d) return dirname(file);
    d = up;
  }
}

/**
 * One fact a CONTENT COLLECTION declares about itself in `manifest.yaml`.
 *
 * The same file `collectionNamespace` reads, asked for any key. `paths._manifest`
 * is its python twin and had DEFAULTS -- `_manifest("course_olx",
 * "bmod_course.olx")` -- so one course's filenames sat in the engine as
 * fallbacks. The collection declares them now, and neither side needs a default.
 *
 * DELIBERATELY NOT A YAML PARSER. These are flat `key: value` lines and a
 * dependency to read them would be the larger cost; a value this misses reads
 * as undeclared, which is the same answer as a missing key and is safe.
 */
export function collectionDeclares(ns: string, key: string): string | null {
  const dir = collectionDir(ns);
  if (!dir) return null;
  try {
    const text = readFileSync(resolve(dir, 'manifest.yaml'), 'utf8');
    const m = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm').exec(text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * The id of the RUBRIC, or of the INSTRUMENT it scores.
 *
 * THE NAMESPACE WAS DOING THIS JOB AND IS NOT THE RIGHT THING FOR IT: it names
 * a content COLLECTION, and `psychology/` serves two courses. Everything under
 * the data root is owned by something narrower -- the user's framing,
 * 2026-09-26: *"it's not really the COURSE that's the individuator. It's the
 * rubric"*, then *"the original handouts are instruments, not rubrics"*.
 *
 * DERIVED BY SHAPE, declarable by name, exactly as `paths._scoring_id` does it:
 * `bmod_rubric.olx` gives `bmod`, and the handouts beside it share the prefix
 * because a rubric and the instrument it scores are authored together. One
 * derivation, two readers -- not a transcription that drifts.
 */
export function scoringId(ns: string, key: 'rubric_id' | 'instrument_id'): string {
  const declared = declaredValue(ns, key);
  if (declared) return declared;
  const rubric = rubricFile(ns);
  if (rubric) {
    const stem = basename(rubric).replace(/\.olx$/, '');
    // THE TWO KEYS DERIVE DIFFERENTLY, and both stripped `_rubric` until
    // 2026-09-26. `<x>_rubric.olx` and the handouts `<x>_handout1.olx` beside
    // it then BOTH answered `<x>`, so the two owners this function exists to
    // distinguish were indistinguishable by name and the store held
    // `rubrics/<x>` and `instruments/<x>`. The INSTRUMENT is the family the
    // handouts share, which is the stem without `_rubric`; the RUBRIC is the
    // component itself, and its id is its whole stem.
    //
    // PYTHON'S `_scoring_id` MAKES THE SAME SPLIT and the two must agree
    // exactly: this side reading `<x>` while python writes
    // `rubrics/<x>_rubric` does not fail, it reads an EMPTY directory --
    // which is how it was actually found, as fifteen rules reporting empty
    // payloads rather than as a missing path.
    if (key === 'rubric_id') return stem;
    return stem.replace(/_rubric$/, '') || stem;
  }
  // THE NAMESPACE IS THE FALLBACK, and only when there is nothing narrower to
  // name. python's equivalent fell back to the ACTIVE course's namespace here
  // and handed a second course the first one's directory; `ns` is the course
  // being asked about, so the same mistake cannot be made on this side.
  return ns;
}

/**
 * Where a RUBRIC's own state lives: its run archive, composed documents, gold.
 *
 * Write a second rubric for the same handout and this tree is NEW while
 * `instrumentDir` is shared unchanged. That is the whole content of the split.
 */
export function rubricDir(ns: string): string {
  return resolve(courseDir('COURSE_DATA', ns), 'rubrics', scoringId(ns, 'rubric_id'));
}

/**
 * PRIMARY AND DERIVED, SAID IN THE DIRECTORY NAME.
 *
 * The store separates material that cannot be regenerated from material that
 * can, because protection used to be an ENUMERATION and had to be rewritten
 * twice in one day to chase files as they moved. With the split the rule is
 * positional: nothing under a `source/` may be rewritten, whatever it holds.
 *
 * `authored` is the third class -- human-written documents that accumulate with
 * the scoring work (the backlog, the goals). Not derived, not primary evidence.
 */
export function rubricAuthored(ns: string): string {
  return resolve(rubricDir(ns), 'authored');
}
export function rubricDerived(ns: string): string {
  return resolve(rubricDir(ns), 'derived');
}
export function instrumentSource(ns: string): string {
  return resolve(instrumentDir(ns), 'source');
}
export function instrumentDerived(ns: string): string {
  return resolve(instrumentDir(ns), 'derived');
}

/**
 * Resolve a record's `{root}/rest` path token against this course's roots.
 *
 * A RECORD THAT CARRIES AN ABSOLUTE PATH IS PINNED TO ONE MACHINE'S DISK, and
 * worse, to one day's layout: fifteen paths in `PROBED.json` were found broken
 * by a root move, with nothing reporting it -- the file still parsed, the
 * fields were still strings, and a reader that could not find an artifact
 * simply found none. So records name an OWNER and a path within it, and each
 * side resolves. This is python's `paths.record_path`, on this side.
 *
 * AN ABSOLUTE PATH PASSES THROUGH unchanged, because records are being
 * converted and an old one must keep working; what must not happen silently is
 * a NEW one, and that is the machine-path check's job, not this function's.
 */
/**
 * Document formats the engine must never open.
 *
 * THE USER'S CONSTRAINT, 2026-09-26: *"We don't want the web engine going into
 * raw docs."* Everything the engine needs from a submission or a graders'
 * workbook now exists as a RECORD -- the reconstructed boxes, the grader marks,
 * the column headings, the cell set. Python reads the source documents and
 * exports; the engine reads exports. Nothing on this side should ever parse a
 * `.docx`.
 *
 * ENFORCED, NOT INTENDED. The records made it unnecessary; this makes it
 * impossible. A guard that exists only as a convention is one that lapses the
 * first time a reader is added in a hurry -- and the failure would be silent in
 * the worst direction, because a `.docx` read with a text reader returns
 * plausible-looking bytes rather than an error.
 *
 * NOT THE WHOLE `source/` TREE. The engine legitimately reads `handsplit/`,
 * which lives there: it is a hand-made JSON RECORD of a person's reading, not a
 * document. The line is the FORMAT, which is what "raw doc" names.
 */
export const RAW_DOCUMENT_FORMATS = ['.docx', '.doc', '.xlsx', '.xls',
                                     '.pptx', '.ppt', '.pdf', '.odt'];

/** Refuse a path the engine must not parse. Returns the path when it is fine. */
export function refuseRawDocument(path: string): string {
  const lower = String(path ?? '').toLowerCase();
  const hit = RAW_DOCUMENT_FORMATS.find(ext => lower.endsWith(ext));
  if (!hit) return path;
  throw new Error(
    `enforce: refusing to read ${path} -- the engine must not open a raw ` +
    `document (${hit}). Everything it needs from a submission or a graders' ` +
    `workbook exists as a record: the reconstructed boxes, the grader marks, ` +
    `the column headings, the cell set. Python reads the source and exports; ` +
    `this side reads the export. If something is genuinely missing, add an ` +
    `exporter rather than a reader.`);
}

export function recordPath(token: string, ns: string): string {
  const s = String(token ?? '');
  if (!s.startsWith('{')) return s;
  const close = s.indexOf('}');
  const name = s.slice(1, close);
  const rest = s.slice(close + 1).replace(/^\/+/, '');
  const roots: Record<string, (n: string) => string> = {
    rubric: rubricDir, instrument: instrumentDir,
    metadata: (n) => courseDir('COURSE_METADATA', n),
  };
  const root = roots[name];
  if (!root) {
    throw new Error(
      `enforce/courseData: \`{${name}}\` is not a declared record root. ` +
      `Known: ${Object.keys(roots).sort().join(', ')}`);
  }
  return resolve(root(ns), rest);
}

/**
 * Where an INSTRUMENT's own state lives: the handout documents, the responses
 * to it, and the two derived segmentations of those responses.
 *
 * SHARED BY EVERY RUBRIC THAT SCORES IT. Filing these under a rubric id would
 * not merely mislabel them -- it would invite a second copy of the corpus.
 */
export function instrumentDir(ns: string): string {
  return resolve(courseDir('COURSE_DATA', ns), 'instruments',
                 scoringId(ns, 'instrument_id'));
}

/**
 * Where a course's RUN OUTPUT lives.
 *
 * IT WAS `join(courseDir(...), 'out')`, unconditionally, which was correct only
 * while the one course using it declared the pre-namespacing shared layout. The
 * moment that course standardised (2026-09-26) every recorded artifact became
 * unfindable from this side while python found them all -- fifty audit findings
 * that were a hardcoded path and not a missing file. It then briefly read the
 * `shared_data_layout` flag, which was retired the same day once the layout it
 * chose between turned out to be keyed on the namespace either way.
 */
export function outDir(ns: string): string {
  return resolve(rubricDerived(ns), 'out');
}

/** One root a NAMED course declares about itself, or null. */
/**
 * One RAW value from the rubric's frontmatter, unresolved.
 *
 * Split out from `declaredRoot` because not every declaration is a path. The
 * rubric and instrument IDs are names, and running them through the `~` / `./`
 * / `$` path resolution below would turn `bmod` into an absolute directory.
 */
export function declaredValue(ns: string, key: string): string | null {
  if (!collectionDir(ns)) return null;
  let head: string;
  try {
    // By SHAPE, not by name: naming the file would put a course's filename
    // back into the engine, which is what the declaration moves out of it.
    const rubric = rubricFile(ns);
    if (!rubric) return null;
    head = readFileSync(rubric, 'utf8').slice(0, 4000);
  } catch {
    return null;
  }
  const block = /^---\s*$\n([\s\S]*?)^---\s*$/m.exec(head);
  if (!block) return null;
  const m = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm').exec(block[1]);
  return m ? m[1] : null;
}

function declaredRoot(ns: string, key: string): string | null {
  const dir = collectionDir(ns);
  if (!dir) return null;
  const raw = declaredValue(ns, key);
  if (raw === null) return null;
  if (raw.startsWith('~')) return resolve(homedir(), raw.slice(1).replace(/^\//, ''));
  // `./` is relative to the COURSE REPOSITORY, which the mount points at.
  if (raw.startsWith('./')) return resolve(dir, '..', raw.slice(2));
  if (raw.startsWith('$')) return null;      // an env reference is not a declaration
  return resolve(raw);
}

/**
 * The directory a course variable names FOR ONE COURSE, or a refusal.
 *
 * Precedence: the course's own declaration, then `$NAME` — and the environment
 * variable is honoured ONLY when a single course is mounted. With several, one
 * global variable naming one directory cannot be right for all of them, and
 * picking one silently is the failure this whole file is written against.
 */
export function courseDir(
  name: 'COURSE_DATA' | 'COURSE_METADATA', ns: string,
): string {
  return real(courseDirRaw(name, ns));
}

// THE REAL DIRECTORY, NOT THE ROUTE TAKEN TO IT. The mount is a SYMLINK
// (`content/<ns>` -> the course repository), so resolving a declaration through
// it produced `.../lo-blocks/content/edu.memphis.psych/course_metadata` for the
// directory python calls `.../edu.memphis.psych/course_metadata`. The same
// directory, under two names -- which is exactly the shape that makes a
// cross-engine comparison read as a difference when there is none. Goal E58
// lists it: *"Functionally identical, comparably confusing; `realpath`"*.
//
// A PATH THAT DOES NOT EXIST IS RETURNED UNCHANGED, because a refusal about a
// missing directory belongs to the caller that tried to read it, and a
// `realpath` failure here would replace that caller's specific message with a
// less useful one.
function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function courseDirRaw(
  name: 'COURSE_DATA' | 'COURSE_METADATA', ns: string,
): string {
  if (!ns) {
    throw new Error(
      `enforce/courseData: ${name} was asked for without naming a course. ` +
      `Roots are per course; say which one.`);
  }
  const declared = declaredRoot(ns, name.toLowerCase());
  if (declared) return declared;
  const v = process.env[name];
  const mounted = mountedCourses();
  if (v && mounted.length <= 1) return resolve(v);
  if (v) {
    throw new Error(
      `enforce/courseData: ${ns} declares no ${name.toLowerCase()}: and ` +
      `$${name} cannot be used -- ${mounted.length} courses are mounted ` +
      `(${mounted.join(', ')}) and one variable cannot name them all. ` +
      `Declare it in ${ns}'s rubric frontmatter.`);
  }
  throw new Error(
    `enforce/courseData: ${name} is not set and ${ns}'s rubric declares no ` +
    `${name.toLowerCase()}:. Refusing to guess a location — a default would ` +
    `read some other course's records and report confidently about a corpus ` +
    `this check never saw.`);
}

/**
 * Read a JSON file, having proved it sits under the named course directory.
 *
 * The containment check is not ceremony: a path arriving from a caller is the
 * one place this package could be pointed at anything on the filesystem, and a
 * rule that reads an arbitrary file is no longer a rule about the course.
 */
export function readCourseJson(
  name: 'COURSE_DATA' | 'COURSE_METADATA', path: string, ns: string,
): unknown {
  const root = courseDir(name, ns);
  const full = resolve(root, path);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(
      `enforce/courseData: ${path} resolves outside $${name} (${root}). ` +
      `Refusing: a check that can read any path is not a check about this course.`);
  }
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    throw new Error(`enforce/courseData: cannot read ${full}: ${String(e)}`);
  }
}
