// src/lib/util/index.ts
export function enumdict<T extends string>(keys: readonly T[]): { readonly [K in T]: K } {
  return Object.fromEntries(keys.map(k => [k, k])) as { readonly [K in T]: K };
}


export function isBlockTag(tag: string) {
  if (!tag) return false;
  const first = tag[0];
  return first === first.toUpperCase();
}
