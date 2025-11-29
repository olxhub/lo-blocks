// src/lib/util/index.ts
//
// Utility functions - small helpers used throughout Learning Observer.
//
// Provides common utility functions that don't belong in any specific domain:
// - `enumdict`: Creates type-safe enums from string arrays
// - `isBlockTag`: Identifies Learning Observer block tags by PascalCase convention
//   (used to distinguish blocks from HTML tags during parsing and rendering)
// - `resolveImageSrc`: Classifies image paths by type (external, platform, content)
// - `resolveImagePath`: Resolves image paths to final URLs for Next.js Image
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
 * Image path types for resolution
 */
export type ImagePathType = 'external' | 'platform' | 'content';

export interface ResolvedImageSrc {
  type: ImagePathType;
  src: string;
}

/**
 * Classify an image source path by type.
 *
 * Path types:
 * - external: Full URLs (http://, https://)
 * - platform: Platform-wide assets (// prefix, served from public/)
 * - content: Content-relative paths (everything else)
 */
export function resolveImageSrc(src: string): ResolvedImageSrc {
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
 * Resolve an image path to a final URL for Next.js Image component.
 *
 * Returns null for null/undefined input.
 */
export function resolveImagePath(src: string | null | undefined): string | null {
  if (!src) return null;

  const resolved = resolveImageSrc(src);

  switch (resolved.type) {
    case 'external':
      return resolved.src;
    case 'platform':
      return `/${resolved.src}`;
    case 'content':
      return `/content/${resolved.src}`;
  }
}
