// Does the designed wording actually SHIP, and does every exemption still work?
//
// Goal K. Both are content against content: a design table against the prompt
// the item ships, and an exemption table against the sheet it excuses.

export type DesignedEntry = { item: string; slot: string; field: string; want: string };

/** Whitespace-insensitive, because a rebuild may rewrap without changing the text. */
const flat = (s: string) => String(s ?? '').split(/\s+/).filter(Boolean).join(' ');

/**
 * A DESIGNED_TEXT entry whose wording is not in the prompt its item ships.
 *
 * SIX OF TWELVE ENTRIES ONCE DID NOT SHIP and nothing said so: the existing
 * links all keyed off the sha file, which records the rubric's own text, so a
 * design that never reached the .olx compared clean against itself.
 */
export function everyDesignedEntryShips(
  p: { entries: DesignedEntry[]; prompts: Record<string, string> },
): string[] {
  const out: string[] = [];
  for (const e of p?.entries ?? []) {
    const shipped = p.prompts?.[e.item];
    if (shipped === undefined) {
      // NOT SILENCE: an item whose prompt could not be built is an entry this
      // could not check, and dropping it would shrink the denominator unseen.
      out.push(
        `${e.item}/${e.slot}.${e.field}: no shipped prompt was supplied for ` +
        `${e.item}, so its design could not be checked against anything`);
      continue;
    }
    const want = flat(e.want);
    if (!want || flat(shipped).includes(want)) continue;
    out.push(
      `${e.item}/${e.slot}.${e.field}: DESIGNED_TEXT holds ${want.length} chars ` +
      `that are NOT in ${e.item}'s shipped prompt. Either the revert that ` +
      `retired this design never dropped its entry, or a build did not land`);
  }
  return out;
}

export type Exemption = {
  item: string; name: string; why: string;
  /** Is `name` a generated attribute at all? */
  isGenerated: boolean;
  /** Is the attribute actually present on the sheet, non-empty? */
  present: boolean;
};

/**
 * An exemption that no longer excuses anything.
 *
 * An entry says: this generated attribute is hand-authored ON PURPOSE, do not
 * report it as an orphan. It means something only while the attribute is
 * PRESENT — otherwise it is a standing permission for a finding that cannot
 * occur, and those accumulate silently.
 */
export function handAuthoredAttrsStillSuppressSomething(
  p: { entries: Exemption[] },
): string[] {
  const out: string[] = [];
  for (const e of [...(p?.entries ?? [])].sort(
    (a, b) => (a.item + a.name).localeCompare(b.item + b.name))) {
    if (!e.isGenerated) {
      out.push(`HAND_AUTHORED_ATTRS names ${e.item}/${e.name}, which is not a ` +
               `generated attribute at all`);
      continue;
    }
    if (!e.present) {
      out.push(`HAND_AUTHORED_ATTRS excuses ${e.item}/${e.name}, and that ` +
               `attribute is not present in the sheet -- the entry excuses nothing`);
    }
  }
  return out;
}
