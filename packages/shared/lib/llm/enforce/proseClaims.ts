// Numbers written into the repo that disagree with the recorded measurement.
//
// Ported from `measured.prose_claims` (goal K), SPLIT: python supplies the
// candidate LINES and the ledger; every judgement about the sentence is here.
//
// A FIGURE IN PROSE IS THE FORM A MEASUREMENT TRAVELS IN -- a guide, a backlog
// entry, a note in a module -- and it goes stale silently. Two items were
// described in writing as perfect while standing at 12/14 and 14/15, because
// the sentences outlived the denominators they were computed over.
//
// DELIBERATELY NARROW, so it fires on real staleness rather than on every
// number in the tree. A finding needs ALL of: an item name from the job list, a
// fraction within 45 characters after it, a DENOMINATOR equal to that item's
// currently recorded one, and a numerator that disagrees. Matching the
// denominator is what makes it a claim about the present configuration; a
// fraction over the old denominator is history and is left alone.
//
// FIVE WAYS A TRUE SENTENCE WOULD OTHERWISE READ AS FALSE, each one a real
// false positive this list exists to stop:
//
//   HISTORICAL FRAMING -- "was", "previously", "no longer", or a fraction
//     attributed to a NAMED artifact (`web_v8`, `baseline_`): a claim about
//     that run, not about the present, however present-tense the verb.
//   A COUNT, NOT A RATE -- "excludes 10 of 20", "flags 18 of 20". The
//     denominator is the same 20 whether the fraction counts cells or scores
//     them, so the surrounding words are the only way to tell, and getting it
//     wrong yields a confident lie.
//   THE NEAREST NAME OWNS THE FRACTION, not the first in the window.
//   THE NEAREST SIDE CUE OWNS IT TOO. This took the last cue in ITERATION
//     order instead, so "Q6 records cli 17/20 and web 18/20" attributed the WEB
//     figure to the cli -- every such sentence read as a contradiction, and the
//     only way to quiet it was one side per line, a formatting rule invented by
//     a bug.
//   A CLOSED LEDGER ENTRY, or a line TYPED BEFORE the recording it appears to
//     contradict. Both are records of what was believed then.

const FRAC = /\b(\d{1,2})\s*(?:\/|\s+of\s+)\s*(\d{1,2})\b/g;
const TOKEN = /[A-Za-z0-9]+/g;
const WINDOW = 45;

const HISTORICAL = new RegExp(
  '\\b(was|were|had been|used to|previously|prior|before|earlier|once|' +
  'then|originally|superseded|stale|reported as|no longer)\\b' +
  '|\\b(web_v|cli_v|qc_v|qc_h|opusweb|baseline_)\\w*', 'i');

const COUNTING = /exclud|flag|cells|participants|of the rest|rows|boxes|slots|passes|runs/i;

/**
 * BOTH VOCABULARIES ARE CUES. The sides were renamed, and the prose this scans
 * is years of history -- dropping the old words would make every older sentence
 * resolve to the default side and compare its number against the wrong column.
 * `opus` sits later in "paper_opus" than `paper` does, so the rfind-max below
 * resolves that pair correctly.
 */
const CUES: Array<[string, string]> = [
  ['web', 'olx'], ['app', 'olx'], ['olx', 'olx'],
  ['cli', 'olx'], ['harness', 'olx'], ['python', 'olx'],
  ['paper', 'paper'], ['opus', 'paper_opus'],
];

export type ProseClaimsPayload = {
  /** Every line of every scanned file, with its filename and 1-based number. */
  lines: Array<{ file: string; lineno: number; text: string }>;
  /** Item ids from the job list; only these own a fraction. */
  jobs: string[];
  /** side -> item -> the recorded measurement. */
  records: Record<string, Record<string, {
    numerator: number; denominator: number;
    pending?: boolean; recorded?: string | null; stamp?: string | null;
  }>>;
  defaultSide: string;
  /** The ledger filename whose closed entries and write dates are special. */
  goalsFile: string;
  /** Lines in that file that are CLOSED entries: records, not claims. */
  goalsRecordLines: number[];
  /** line -> the ISO date it was written, where known. */
  goalsLineWritten: Record<string, string>;
};

export function proseClaims(p: ProseClaimsPayload): string[] {
  const jobs = new Set(p?.jobs ?? []);
  const recLines = new Set(p?.goalsRecordLines ?? []);
  const out: string[] = [];

  for (const ln of p?.lines ?? []) {
    if (HISTORICAL.test(ln.text)) continue;
    FRAC.lastIndex = 0;
    for (let m = FRAC.exec(ln.text); m; m = FRAC.exec(ln.text)) {
      const window = ln.text.slice(Math.max(0, m.index - WINDOW), m.index);
      // THE NEAREST ITEM NAME BEFORE THE FRACTION OWNS IT.
      const names = (window.match(TOKEN) ?? []).filter(t => jobs.has(t));
      if (!names.length) continue;
      const item = names[names.length - 1];

      // THE NEAREST CUE, by last position -- not by table order.
      let side = p.defaultSide;
      let best = -1;
      const low = window.toLowerCase();
      for (const [cue, s] of CUES) {
        const at = low.lastIndexOf(cue);
        if (at > best) { best = at; side = s; }
      }

      const rec = (p.records?.[side] ?? {})[item];
      if (!rec || rec.pending) continue;
      const num = Number(m[1]);
      const den = Number(m[2]);
      if (den !== rec.denominator || num === rec.numerator) continue;
      if (COUNTING.test(window)) continue;

      if (ln.file === p.goalsFile) {
        if (recLines.has(ln.lineno)) continue;          // a closed entry: a record
        const when = p.goalsLineWritten?.[String(ln.lineno)];
        const stamped = String(rec.recorded ?? rec.stamp ?? '').slice(0, 10);
        if (when && stamped && when < stamped) continue; // typed before the recording
      }
      out.push(
        `${ln.file}:${ln.lineno} says ${item} ${num}/${den}, but the ` +
        `recorded ${side} measurement is ` +
        `${rec.numerator}/${rec.denominator}` +
        ` — update the sentence, or re-record if the sweep is newer`);
    }
  }
  return out;
}
