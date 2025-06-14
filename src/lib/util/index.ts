// src/lib/util/index.ts
export function enumdict<T extends string>(keys: readonly T[]): { readonly [K in T]: K } {
  const result = {} as { readonly [K in T]: K };
  for (const key of keys) {
    result[key] = key;
  }
  return result;
}


export function isBlockTag(tag: string) {
  if (!tag) return false;
  const first = tag[0];
  return first === first.toUpperCase();
}
