// src/lib/blocks/utils.js
export function isBlockTag(tag) {
  if (!tag) return false;
  const first = tag[0];
  return first === first.toUpperCase();
}
