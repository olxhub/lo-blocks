// lib/crdt/computeSplice.ts
//
// Minimal splice computation — diff two strings into a single splice operation.
//
// Used by docField to convert textarea onChange (full text replacement) into
// a precise (index, deleteCount, inserted) delta for the RGA CRDT. This
// keeps the event payload small and enables character-level collaborative editing.
//
// Algorithm: common-prefix + common-suffix diffing. O(n) in string length.
// Sufficient for single-user edits where changes are localized. For multi-cursor
// or paste-over-selection scenarios, a more sophisticated diff (Myers, patience)
// could produce better results, but this handles all practical cases.
//

/**
 * Computes the minimal splice from oldStr to newStr using
 * common-prefix + common-suffix diffing. O(n) in string length.
 */
export function computeSplice(
  oldStr: string,
  newStr: string
): { index: number; deleteCount: number; inserted: string } {
  let prefixLen = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteCount = oldStr.length - prefixLen - suffixLen;
  const inserted = newStr.slice(prefixLen, newStr.length - suffixLen);

  return { index: prefixLen, deleteCount, inserted };
}
