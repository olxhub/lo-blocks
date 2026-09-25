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

import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';
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
function loBlocksRoot(): string | null {
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

/** One root a NAMED course declares about itself, or null. */
function declaredRoot(ns: string, key: string): string | null {
  const root = loBlocksRoot();
  if (!root) return null;
  const dir = resolve(root, 'content', ns, 'psychology');
  let head: string;
  try {
    // By SHAPE, not by name: naming the file would put a course's filename
    // back into the engine, which is what the declaration moves out of it.
    const rubric = readdirSync(dir).filter(f => f.endsWith('_rubric.olx')).sort()[0];
    if (!rubric) return null;
    head = readFileSync(resolve(dir, rubric), 'utf8').slice(0, 4000);
  } catch {
    return null;
  }
  const block = /^---\s*$\n([\s\S]*?)^---\s*$/m.exec(head);
  if (!block) return null;
  const m = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm').exec(block[1]);
  if (!m) return null;
  const raw = m[1];
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
