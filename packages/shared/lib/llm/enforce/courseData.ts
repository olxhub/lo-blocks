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

import { readFileSync } from 'fs';
import { resolve, sep } from 'path';

/** The directory a course variable names, or a refusal saying which is unset. */
export function courseDir(name: 'COURSE_DATA' | 'COURSE_METADATA'): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `enforce/courseData: ${name} is not set. Refusing to guess a location — ` +
      `a default would read some other course's records and report confidently ` +
      `about a corpus this check never saw. Set it to the course directory.`);
  }
  return resolve(v);
}

/**
 * Read a JSON file, having proved it sits under the named course directory.
 *
 * The containment check is not ceremony: a path arriving from a caller is the
 * one place this package could be pointed at anything on the filesystem, and a
 * rule that reads an arbitrary file is no longer a rule about the course.
 */
export function readCourseJson(
  name: 'COURSE_DATA' | 'COURSE_METADATA', path: string,
): unknown {
  const root = courseDir(name);
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
