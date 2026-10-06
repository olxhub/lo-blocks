// Does shipped prose tell the grader about OUR process rather than the task?
//
// Ported from `enforcement.check_prompts_carry_no_process_history` (goal K).
// The judgement -- what counts as process language -- lives here; python keeps
// the fetch (`leakage.authored`, which is exactly what a grader sees) and the
// report.
//
// THE SIBLING OF leakage's ORIGINAL PROBLEM. There, the cohort's words get into
// a rule and the rule stops generalising. Here the MAINTAINER'S words get in:
// the grader is told about a sweep, a date, a cell count or an earlier draft of
// the rubric -- none of which it can act on, all of which it must read and
// weigh, and none of which anybody decided to say to it.
//
// FOUND BY ACCIDENT, while tracing box deixis. 2a's second guidance bullet
// ended "A rule that charged boxes of that shape was measured on 2026-09-02 and
// broke three cells the graders credit." The RULE is complete in the two
// sentences before it; that one is the ARGUMENT FOR it, addressed to whoever
// next edits the rubric, and it shipped to BOTH sides.
//
// GENERIC BY THE PROJECT'S OWN TEST. The patterns are ENGINE vocabulary -- our
// dates, our sweeps, our filenames -- not this course's content. Any course
// whose rubric is maintained the way this one is can leak the same way.

/** One authored block as a grader sees it: where it came from, and its prose. */
export type AuthoredBlock = { key: string; text: string };

// THE PYTHON PATTERNS, CHARACTER FOR CHARACTER, and in the SAME ORDER. Python
// iterates `PROCESS_PATTERNS` in insertion order and emits every match of each
// pattern before moving to the next, so the findings come out grouped by kind
// rather than by position. A port that scans positionally produces the same SET
// in a different ORDER, and this project compares audit output line by line.
const PROCESS_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: 'a dated measurement', re: /\b20\d\d-\d\d-\d\d\b/gi },
  {
    kind: 'a measurement reported',
    re: /\b(was|were) measured\b|\bmeasured on\b|\bre-?measured\b|\bbroke \w+ cells?\b|\b\w+ cells the graders\b|\b\d+ ?\/ ?\d+ cells?\b/gi,
  },
  {
    kind: 'our process vocabulary',
    re: /\bsub-?goal\b|\bsweeps?\b|\bswept\b|\bre-?sweep\b|\breverted\b|\bthe ledger\b/gi,
  },
  {
    kind: 'our code or artefacts',
    re: /\bscore\.py\b|\bagreement\.py\b|\bolx_prompts\b|\bslotSheet\b|\bprompt sha\b|\bthe \.olx\b/gi,
  },
  {
    kind: "this rubric's own history",
    re: /\bearlier wording\b|\bthis rubric (said|used to)\b|\ban earlier version of this rubric\b/gi,
  },
];

/**
 * Python's `repr` for a string, because the finding text is compared verbatim.
 *
 * `{phrase!r}` prefers single quotes and switches to double quotes when the
 * value contains a single quote and no double -- "this rubric's" is exactly
 * such a phrase, and a naive `'${p}'` renders it wrongly the one time it fires.
 */
function pyRepr(s: string): string {
  if (s.includes("'") && !s.includes('"')) return `"${s}"`;
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Every process-history phrase in the shipped prose, as findings.
 *
 * Deduplicated per (item, kind, phrase-lowercased) because a bullet appears
 * both on its own and inside the assembled prompt, so every real accident would
 * otherwise be reported twice. The FIRST occurrence's context is the one kept.
 */
export function processHistoryFindings(blocks: AuthoredBlock[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { key, text } of blocks) {
    const body = String(text ?? '');
    const item = String(key ?? '').split(/\s+/)[0] ?? '';
    for (const { kind, re } of PROCESS_PATTERNS) {
      re.lastIndex = 0;
      for (const m of body.matchAll(re)) {
        const phrase = m[0];
        const dedupe = `${item} ${kind} ${phrase.toLowerCase()}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const start = Math.max(0, (m.index ?? 0) - 70);
        const end = Math.min(body.length, (m.index ?? 0) + phrase.length + 70);
        const context = body.slice(start, end).split(/\s+/).filter(Boolean).join(' ');
        out.push(
          `${item}: shipped prose carries ${kind} -- ${pyRepr(phrase)} in ` +
          `…${context.slice(0, 110)}…. The grader cannot act on ` +
          `this; move it to a comment beside the rule`);
      }
    }
  }
  return out;
}
