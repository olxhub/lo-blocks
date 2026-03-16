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
// IMPORTANT: Indices are in Unicode code points, not UTF-16 code units.
// RGA iterates characters via for...of (code points), so splice indices must
// match. Astral characters (emoji, CJK supplementary, etc.) are one code point
// but two UTF-16 code units — using .length would produce wrong indices.
//

/**
 * Computes the minimal splice from oldStr to newStr.
 *
 * Returns code-point-based indices (matching RGA's for...of iteration).
 * The `inserted` string is a plain JS string (for...of will decompose it
 * into code points on the receiving end).
 */
export function computeSplice(
  oldStr: string,
  newStr: string
): { index: number; deleteCount: number; inserted: string } {
  // Convert to code point arrays for correct indexing with astral characters
  const oldCp = Array.from(oldStr);
  const newCp = Array.from(newStr);

  let prefixLen = 0;
  const minLen = Math.min(oldCp.length, newCp.length);
  while (prefixLen < minLen && oldCp[prefixLen] === newCp[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldCp[oldCp.length - 1 - suffixLen] === newCp[newCp.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteCount = oldCp.length - prefixLen - suffixLen;
  // Reconstruct inserted string from code point array slice
  const inserted = newCp.slice(prefixLen, newCp.length - suffixLen).join('');

  return { index: prefixLen, deleteCount, inserted };
}
