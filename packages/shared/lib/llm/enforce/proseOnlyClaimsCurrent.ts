// A "not convertible" claim judged against a primitive set that has since grown.
//
// Ported from `enforcement.check_prose_only_claims_are_current` (goal K).
//
// A SLOT DECLARED PROSE-ONLY IS A CLAIM WITH A DATE ON IT. It says: given the
// primitives that exist, this rule cannot be expressed as one. Add a primitive
// and the claim may simply have stopped being true -- and nothing about a stale
// claim looks stale, because the declaration reads exactly as it did the day it
// was right.
//
// SO EVERY CLAIM CARRIES THE SET IT WAS JUDGED AGAINST, and this compares that
// stamp against the registry now. An unstamped claim cannot be re-tested at
// all, which is why it is a finding in its own right rather than a tidiness
// note.
//
// STILL NOT CONVERTIBLE IS A FINE ANSWER. The point is that somebody looked
// again when the ground moved; the budget does not have to fall.

export type ProseOnlyPayload = {
  /** The primitive attributes the registry declares NOW, sorted. */
  now: string[];
  /** `item|slot` for every slot declared prose-only. */
  slots: string[];
  /** `item|slot` -> the comma-joined primitive set it was judged against. */
  judgedAgainst: Record<string, string>;
};

/** Python renders the key as `['item', 'slot']`. */
function keyRepr(key: string): string {
  return `[${key.split('|').map(p => `'${p}'`).join(', ')}]`;
}

export function proseOnlyClaimsAreCurrent(p: ProseOnlyPayload): string[] {
  const now = [...(p?.now ?? [])].sort().join(',');
  const slots = new Set(p?.slots ?? []);
  const stamps = p?.judgedAgainst ?? {};
  const out: string[] = [];

  for (const k of [...slots].filter(k => !(k in stamps)).sort()) {
    out.push(
      `PROSE_ONLY_SLOTS${keyRepr(k)} is declared NOT CONVERTIBLE with no ` +
      `entry in PROSE_ONLY_JUDGED_AGAINST -- an undated claim cannot be ` +
      `re-tested when the primitive set grows. Stamp it with the set it ` +
      `was judged against`);
  }
  for (const k of Object.keys(stamps).filter(k => !slots.has(k)).sort()) {
    out.push(
      `PROSE_ONLY_JUDGED_AGAINST${keyRepr(k)} stamps a slot that is no longer ` +
      `in PROSE_ONLY_SLOTS -- the entry left and its stamp did not`);
  }
  for (const k of [...slots].filter(k => k in stamps).sort()) {
    const was = stamps[k];
    if (was === now) continue;
    const nowSet = new Set(now.split(','));
    const wasSet = new Set(was.split(','));
    const added = [...nowSet].filter(a => !wasSet.has(a)).sort();
    const gone = [...wasSet].filter(a => !nowSet.has(a)).sort();
    const what: string[] = [];
    if (added.length) {
      what.push('the registry now also has ' + added.map(a => `\`${a}\``).join(', '));
    }
    if (gone.length) {
      what.push('no longer has ' + gone.map(a => `\`${a}\``).join(', '));
    }
    out.push(
      `PROSE_ONLY_SLOTS${keyRepr(k)} was judged NOT CONVERTIBLE against ` +
      `{${was}}; ${what.join('; ')}. Re-judge the claim against the new ` +
      `set, then re-stamp it. Still not convertible is a fine answer -- ` +
      `the budget does not have to fall`);
  }
  return out;
}
