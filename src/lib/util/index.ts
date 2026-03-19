// src/lib/util/index.ts
//
// Utility functions - small helpers used throughout Learning Observer.
//
// Provides common utility functions that don't belong in any specific domain:
// - `enumdict`: Creates type-safe enums from string arrays
// - `isBlockTag`: Identifies Learning Observer block tags by PascalCase convention
//   (used to distinguish blocks from HTML tags during parsing and rendering)
// - `resolveContentSrc`: Classifies content paths by type (external, platform, content)
// - `resolveContentPath`: Resolves content paths to final URLs for serving
// - `hashContent`: Hash file/content for replicability in learning analytics
//

export function enumdict<T extends string>(keys: readonly T[]): { readonly [K in T]: K } {
  return Object.fromEntries(keys.map(k => [k, k])) as { readonly [K in T]: K };
}


export function isBlockTag(tag: string) {
  if (!tag) return false;
  const first = tag[0];
  return first === first.toUpperCase();
}

/**
 * Content path types for resolution
 */
export type ContentPathType = 'external' | 'platform' | 'content';

export interface ResolvedContentSrc {
  type: ContentPathType;
  src: string;
}

/**
 * Classify a content source path by type.
 *
 * Path types:
 * - external: Full URLs (http://, https://)
 * - platform: Platform-wide assets (// prefix, served from public/)
 * - content: Content-relative paths (everything else)
 */
export function resolveContentSrc(src: string): ResolvedContentSrc {
  // External URLs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { type: 'external', src };
  }

  // Platform-wide assets (// prefix)
  if (src.startsWith('//')) {
    return { type: 'platform', src: src.slice(2) };
  }

  // All other paths treated as content paths
  return { type: 'content', src: src.startsWith('/') ? src.slice(1) : src };
}

/**
 * Resolve a content path to a final URL for serving.
 *
 * Returns null for null/undefined input.
 */
export function resolveContentPath(src: string | null | undefined): string | null {
  if (!src) return null;

  const resolved = resolveContentSrc(src);

  switch (resolved.type) {
    case 'external':
      return resolved.src;
    case 'platform':
      return `/${resolved.src}`;
    case 'content':
      return `/content/${resolved.src}`;
  }
}

/**
 * Hash content (file body) for replicability in learning analytics.
 * Used to identify files across sessions and enable download restoration.
 * Returns 8-char hex string (first 64 bits of SHA256).
 * Works in both Node.js and browser environments via Web Crypto API.
 */
export async function hashContent(content: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hex = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 8);
}
