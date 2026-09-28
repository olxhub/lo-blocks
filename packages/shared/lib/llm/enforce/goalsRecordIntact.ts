// A goals ledger's entries: unique labels, resolving citations, nothing deleted
// or quietly closed.
//
// Ported from `goals.check` (goal K). THE JUDGEMENT IS GENERIC and the data is
// not. "A label is a NAME, not a position, so it must be unique and must never
// be reissued", "a citation must resolve", "an entry is closed, never deleted",
// and "a closure needs the user's agreement" are statements about how a record
// of decisions works. Which labels exist, which documents cite them, what the
// last commit held and which closures were approved are all this project's.
//
// WHY `before` IS PASSED AND NOT READ HERE. It comes from `git show HEAD:...`,
// and a rule that shells out is a rule that behaves differently under a build,
// a hook and a test. The caller reads it; a missing baseline is a FINDING
// rather than a silent pass, which is the distinction rules 3 and 4 depend on.

export type GoalEntry = { label: string; state: ' ' | 'x'; title: string };

export type GoalsPayload = {
  /** Entries as they stand, in file order. Duplicates are kept: they ARE rule 1. */
  entries: GoalEntry[];
  /** Every `goal X<n>` / `subgoal X<n>` mention found across the tree. */
  citations: Array<{ file: string; line: number; label: string }>;
  /** The committed prior state, or null when `git show` returned nothing. */
  before: GoalEntry[] | null;
  /** Named in the message when `before` is null, so the reader can run it. */
  trackedName: string;
  trackedDir: string;
  /** The ledger's filename, quoted in almost every message. */
  recordName: string;
  /** Labels whose closure the user agreed to. */
  closuresApproved: string[];
  /** label -> [newLabel, why], for an entry deliberately refiled. */
  refiled: Record<string, [string, string]>;
};

export function goalsRecordIntact(p: GoalsPayload): string[] {
  const bad: string[] = [];
  const rec = p?.recordName ?? 'GOALS.md';

  // 1. DUPLICATES. Two entries answering to one citation.
  const seen = new Map<string, string>();
  for (const e of p?.entries ?? []) {
    const prefix = e.label.replace(/\d+$/, '');
    if (seen.has(e.label)) {
      bad.push(
        `${rec}: duplicate goal label ${e.label} — '${seen.get(e.label)}' and ` +
        `'${e.title.slice(0, 60)}'. Every citation of ${e.label} is now ambiguous; ` +
        `\`python3 goals.py --next ${prefix}\` allocates a free one`);
    } else {
      seen.set(e.label, e.title.slice(0, 60));
    }
  }

  const now = new Map((p?.entries ?? []).map(e => [e.label, e]));

  // 2. DANGLING CITATIONS, across the tree.
  for (const c of p?.citations ?? []) {
    if (!now.has(c.label)) {
      bad.push(
        `${c.file}:${c.line} cites subgoal ${c.label}, which is not an ` +
        `entry in ${rec} — the label is wrong, or the entry ` +
        `was deleted rather than closed`);
    }
  }

  // A MISSING BASELINE IS A FINDING, NOT A PASS. Rules 3 and 4 compare against
  // the committed state; with none they cannot run, and "cannot run" reported
  // as clean is how a check goes quiet without anyone deciding it should.
  if (p?.before == null) {
    bad.push(
      `${rec}: no committed prior state to compare against -- ` +
      `\`git show HEAD:${p.trackedName}\` in ${p.trackedDir} returned ` +
      `nothing. The deletion and unapproved-closure checks below cannot ` +
      `run, which is NOT the same as their passing. Commit the ledger.`);
    return bad;
  }

  // 3. DELETIONS. A goal is closed, never removed.
  for (const was of p.before) {
    if (now.has(was.label)) continue;
    const moved = (p.refiled ?? {})[was.label];
    if (moved) {
      if (now.has(moved[0])) continue;          // declared, and the target exists
      bad.push(
        `${rec}: goal ${was.label} is declared REFILED to ` +
        `${moved[0]}, but ${moved[0]} is not an entry in the file. A ` +
        `refile that points nowhere is a deletion with a note on it`);
      continue;
    }
    bad.push(
      `${rec}: goal ${was.label} ('${was.title.slice(0, 60)}') was in the recorded ` +
      `state and is GONE. Goals are closed with \`- [x]\`, never deleted — ` +
      `the entry is what stops the work being redone, and its number is ` +
      `cited elsewhere. Restore it`);
  }

  // 4. UNAPPROVED CLOSURES. The ledger's own first rule, enforced.
  const approved = new Set(p.closuresApproved ?? []);
  const beforeBy = new Map(p.before.map(e => [e.label, e]));
  for (const e of p.entries ?? []) {
    const was = beforeBy.get(e.label);
    if (was && was.state === ' ' && e.state === 'x' && !approved.has(e.label)) {
      bad.push(
        `${rec}: goal ${e.label} ('${e.title.slice(0, 60)}') is being CLOSED and the ` +
        `user has not agreed. This file's own first rule is never to close ` +
        `a goal without asking. Ask, then record it in ` +
        `goals.CLOSURES_APPROVED as "${e.label}"`);
    }
  }
  return bad;
}
