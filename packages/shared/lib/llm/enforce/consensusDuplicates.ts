// Does the consensus-spans file define the same cell twice?
//
// Ported from `enforcement.check_consensus_fixes_have_no_duplicate_cells`
// (goal K). Python keeps the fetch -- it knows where the file lives, and the
// selftest injects a path there -- and the judgement lives here.
//
// WHY READING THE LOADED OBJECT CANNOT WORK. `JSON.parse`, exactly like
// `json.load`, resolves a repeated key by keeping the LAST and discarding the
// earlier one, with no error. By the time anything holds the parsed object the
// evidence is gone. Only the raw TEXT can see it, which is why this check is
// handed a string rather than data.
//
// THE HAZARD OUTLIVED ITS ORIGINAL HOME. The corrections moved out of a python
// dict literal into CONSENSUS_SPANS.json when their 102 values -- student
// sentences, the largest store of response text in the repo -- became spans
// resolved from the corpus. The silent-loss hazard moved with them unchanged.
//
// GENERIC BY THE PROJECT'S OWN TEST: "a JSON file that defines a key twice is
// silently losing one" assumes nothing whatever about this course.

// THE PARSE-ERROR ARM STAYS ON THE PYTHON SIDE, and this is a boundary worth
// stating. Its message embeds the PARSER'S own words -- python says "Expecting
// ',' delimiter: line 3 column 9", V8 says "Expected ',' or ']' after array
// element" -- so the two can never agree, and a ported check whose finding text
// differs is indistinguishable in a baseline diff from a new fault. Python
// parses first and reports its own message; this rule is called only with text
// that already parsed. The arm below is kept for this module's own tests and
// for any caller that has not parsed, not because python relies on it.

export type ConsensusDuplicatesPayload = {
  /** The file's raw text. Not its parsed contents -- see above. */
  raw: string;
  /** Its basename, so the finding names the file the reader will open. */
  name?: string;
};

// The python regex, character for character. `m` for `re.M`, `g` because
// python's `findall` returns every match. It deliberately matches nested keys
// too: a duplicate one level down is lost just as silently.
const WRITTEN_KEY = /^[ \t]*"([^"]+)"[ \t]*:/gm;

/**
 * Every cell the file defines more than once.
 *
 * Returns FINDINGS. The fallback arm matters as much as the first: if the
 * written-key count and the loaded-key count disagree while no repeat was
 * named, a duplicate IS being discarded in a spelling this regex could not see,
 * and saying so beats reporting clean.
 */
export function consensusDuplicates(p: ConsensusDuplicatesPayload): string[] {
  const raw = String(p?.raw ?? '');
  const name = p?.name ?? 'CONSENSUS_SPANS.json';

  let loaded: unknown;
  try {
    loaded = JSON.parse(raw);
  } catch (e) {
    return [`${name} is not valid JSON: ${(e as Error).message}`];
  }

  const written: string[] = [];
  for (const m of raw.matchAll(WRITTEN_KEY)) written.push(m[1]);

  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const key of written) {
    if (seen.has(key)) {
      dupes.push(
        `CONSENSUS_SPANS has TWO entries for '${key}'. JSON `
        + `keeps only the last, so the other one is silently `
        + `doing nothing — merge them into one entry`);
    }
    seen.add(key);
  }

  const loadedLen = loaded && typeof loaded === 'object' && !Array.isArray(loaded)
    ? Object.keys(loaded as Record<string, unknown>).length
    : Array.isArray(loaded) ? (loaded as unknown[]).length : 0;
  if (!dupes.length && written.length !== loadedLen) {
    dupes.push(
      `CONSENSUS_SPANS has ${written.length} written key(s) but `
      + `${loadedLen} after loading — a duplicate is being `
      + `discarded and this check could not name it`);
  }
  return dupes;
}
