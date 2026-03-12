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
