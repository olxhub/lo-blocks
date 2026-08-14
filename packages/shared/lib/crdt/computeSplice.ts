// packages/shared/lib/crdt/computeSplice.ts
//
// Minimal splice computation — diff two strings into a single splice.
//
// Used by docField to turn a textarea's onChange (which reports the whole
// new value) back into the (index, deleteCount, inserted) edit the learner
// actually made, so the document CRDT records an edit rather than a
// wholesale replacement.
//
// Algorithm: common prefix + common suffix. O(n) in string length. Enough
// for the localized edits a text input produces; a real diff (Myers,
// patience) would describe a scripted multi-region change better, but
// nothing here generates one.
//
// UNITS ARE UTF-16 CODE UNITS — JavaScript's own string indices, and what
// the sequence CRDT addresses (see crdt/text/README.md; Yjs is the same).
// `'😀'.length === 2`, and both of those code units get their own clock.
//
// Splitting a surrogate PAIR is the one boundary that must not happen: half
// an emoji is not a character, and the CRDT deliberately does not normalize
// such a split to replacement characters the way Yjs does. So a boundary
// that lands mid-pair is widened outward — the whole character is deleted
// and reinserted. Costs a couple of code units in the rare edit that
// changes one emoji into another; the alternative is mojibake.

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

const isHighSurrogate = (unit: number | undefined): boolean =>
  unit !== undefined && unit >= HIGH_SURROGATE_START && unit <= HIGH_SURROGATE_END;

const isLowSurrogate = (unit: number | undefined): boolean =>
  unit !== undefined && unit >= LOW_SURROGATE_START && unit <= LOW_SURROGATE_END;

/** Does an index fall between the two halves of one character? */
const splitsPair = (value: string, index: number): boolean =>
  index > 0 && index < value.length &&
  isHighSurrogate(value.charCodeAt(index - 1)) &&
  isLowSurrogate(value.charCodeAt(index));

/**
 * The minimal splice from oldStr to newStr, in UTF-16 code units.
 *
 * Applying it reproduces newStr exactly:
 *   oldStr.slice(0, index) + inserted + oldStr.slice(index + deleteCount)
 */
export function computeSplice(
  oldStr: string,
  newStr: string
): { index: number; deleteCount: number; inserted: string } {
  const minLen = Math.min(oldStr.length, newStr.length);

  let prefix = 0;
  while (prefix < minLen && oldStr.charCodeAt(prefix) === newStr.charCodeAt(prefix)) {
    prefix++;
  }
  // The two halves of one character are equal or unequal TOGETHER, so a
  // prefix can only stop mid-pair by stopping on the low half. One step back
  // clears it, and the step cannot underflow: index 0 splits nothing.
  // Both strings are checked rather than reasoned about — a lone surrogate
  // is a string a text input can hold, and it must not steer the result.
  if (splitsPair(oldStr, prefix) || splitsPair(newStr, prefix)) prefix--;

  // Bounded so the prefix and suffix cannot claim the same code units.
  const maxSuffix = minLen - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldStr.charCodeAt(oldStr.length - 1 - suffix) ===
      newStr.charCodeAt(newStr.length - 1 - suffix)
  ) {
    suffix++;
  }
  // Symmetrically, a suffix can only stop mid-pair by stopping on the high
  // half. Shrinking it by one moves the boundary past the low half, whose
  // left neighbour is then a low surrogate — never a split.
  if (
    splitsPair(oldStr, oldStr.length - suffix) ||
    splitsPair(newStr, newStr.length - suffix)
  ) suffix--;

  return {
    index: prefix,
    deleteCount: oldStr.length - prefix - suffix,
    inserted: newStr.slice(prefix, newStr.length - suffix),
  };
}
