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
