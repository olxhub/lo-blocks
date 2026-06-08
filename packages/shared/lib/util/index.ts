// packages/shared/lib/util/index.ts
//
// Small generic helpers that don't belong in any specific domain.

export function enumdict<T extends string>(keys: readonly T[]): { readonly [K in T]: K } {
  return Object.fromEntries(keys.map(k => [k, k])) as { readonly [K in T]: K };
}

export function isPascalCase(tag: string) {
  if (!tag) return false;
  const first = tag[0];
  return first === first.toUpperCase();
}

/**
 * Order-independent JSON.stringify for comparing objects where property order
 * may vary (e.g. XML parser output). Sorts object keys before serializing.
 */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val
  );
}

/**
 * Coerce any value to a legible string without throwing — for error messages,
 * `technical` details, debug panels, etc. (NOT for equality; use
 * {@link stableStringify} for that.)
 *
 * - strings pass through unchanged;
 * - otherwise JSON, compact or `pretty` (2-space) per options;
 * - `JSON.stringify(error)` is `"{}"` (message/stack are non-enumerable) and
 *   `undefined` for unsupported values, so we fall back to `String(value)`
 *   (e.g. `"Error: boom"`) rather than emitting an empty/blank result.
 */
export function safeStringify(value: unknown, { pretty = false }: { pretty?: boolean } = {}): string {
  if (typeof value === 'string') return value;
  try {
    const s = JSON.stringify(value, null, pretty ? 2 : undefined);
    return s && s !== '{}' ? s : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Hash content (file body) for replicability in learning analytics.
 * Used to identify files across sessions and enable download restoration.
 * Returns 16-char hex string (64 bits of SHA256).
 * Works in both Node.js and browser environments via Web Crypto API.
 */
export async function hashContent(content: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hex = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}
