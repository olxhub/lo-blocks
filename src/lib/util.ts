// src/lib/util.ts
export function enumdict<T extends string>(keys: readonly T[]): { readonly [K in T]: K } {
  const result = {} as { readonly [K in T]: K };
  for (const key of keys) {
    result[key] = key;
  }
  return result;
}

