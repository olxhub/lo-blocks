// MANDATORY: every rubric `desc`/`rule` the graders read matches its
// design-of-record sha. Reported as PROMPT FIELD IS NOT THE DESIGNED TEXT.
//
// Ported from `enforcement.check_every_prompt_field_is_designed` (goal K).
//
// THE OPT-IN TIER IS NOT ENOUGH, and the user said so. `DESIGNED_TEXT` -- the
// table `shippedTextMatchesDesign` reads -- guards wording somebody chose to
// enter, so it cannot police a field nobody thought to write down, which is
// exactly the case that cost a sweep. This covers ALL the desc/rule fields
// across every rubric.
//
// SHA RATHER THAN FULL TEXT, for reviewability: 47KB of duplicated prose in a
// table is not read, a hundred-odd short lines are, and a change shows up as one
// line in a diff. The cost is that a sha detects drift without recovering the
// original, which is why the opt-in tier still exists for wording a subgoal
// explicitly commits to -- that tier keeps the words.
//
// THERE IS DELIBERATELY NO BULK REGENERATE. One sha is accepted at a time, by
// name, printing what changed. Bulk regeneration would make the file agree with
// anything, which is the same failure as a vocabulary that silently falls back
// to a stale copy.

export type PromptFieldsPayload = {
  /** `item|slot|field` -> the sha of record. */
  want: Record<string, string>;
  /** `item|slot|field` -> the sha of what actually ships. */
  live: Record<string, string>;
  /** The file the shas of record live in, named in every message. */
  shaFile: string;
};

export function everyPromptFieldIsDesigned(p: PromptFieldsPayload): string[] {
  const want = p?.want ?? {}, live = p?.live ?? {};
  const file = p?.shaFile ?? 'DESIGNED_TEXT_SHA.json';
  const slash = (k: string) => k.split('|').join('/');
  const out: string[] = [];
  // THREE FAILURE KINDS, REPORTED SEPARATELY because they mean different
  // things. Collapsing them to "does not match" would hide that a MISSING
  // entry is a decision nobody recorded, while a STALE one is only paperwork.
  for (const key of Object.keys(live).sort()) {
    if (!(key in want)) {
      out.push(
        `MISSING design of record: ${slash(key)} is a prompt field with no ` +
        `entry in ${file}. A slot added without a decision recorded is how ` +
        `re-typing drifts`);
    } else if (want[key] !== live[key]) {
      out.push(
        `CHANGED without acceptance: ${slash(key)} designed ${want[key]}, ` +
        `ships ${live[key]}. If the edit is intended: python3 scoring/measured.py ` +
        `--accept-design-change ${key.split('|').join(' ')}`);
    }
  }
  for (const key of Object.keys(want).filter(k => !(k in live)).sort()) {
    out.push(
      `STALE design of record: ${slash(key)} is in ${file} and no longer in ` +
      `the rubric -- drop it if the revert is permanent`);
  }
  return out;
}
