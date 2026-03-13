// src/components/blocks/Image/_Image.jsx
/*
 * Image Block Implementation
 *
 * SUPPORTED PATH TYPES:
 * 1. Relative paths: "static/image.png"
 *    - Resolved relative to current OLX file directory
 *    - Uses storage provider's resolveRelativePath() method
 *
 * 2. Content-absolute paths: "/mycourse/static/image.png"
 *    - Resolved relative to content root directory
 *    - Leading slash stripped, passed to storage provider
 *
 * 3. Platform-wide assets: "//static/platform-logo.png"
 *    - Served from Next.js public/ directory
 *    - Double slash indicates platform asset
 *
 * 4. External URLs: "https://example.com/image.png"
 *    - Passed through to Next.js Image with external domain config
 *
 * ERROR HANDLING:
 * - Invalid paths, missing images, etc. create ErrorNode entries
 * - Same pattern as PEG parsing errors - xml2json reports errors
 * - Error accumulation during content loading
 *
 * CDN/PRODUCTION:
 * - Images copied to public/content/ during content sync
 * - Next.js optimization works automatically
 * - CDN deployment copies public/ assets
 *
 * SECURITY:
 * - Reuses existing resolveSafePath validation
 * - Prevents directory traversal, symlinks, etc.
 * - Image format validation (jpg, png, gif, svg, webp)
 */

'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { resolveContentPath } from '@/lib/content/contentPaths';

function _Image(props: RuntimeProps) {
  const { src, alt, width, height } = props;

  if (!src) {
    return <div className="text-red-500 border border-red-300 p-2 rounded">
      Image error: src attribute required
    </div>;
  }

  try {
    const finalSrc = resolveContentPath(src)!;

    // Build style: natural size capped at container width by default.
    // If only one dimension is given, the other stays auto to preserve aspect ratio.
    const style: React.CSSProperties = { maxWidth: '100%', height: 'auto' };
    if (width) style.width = /^\d+$/.test(width) ? `${width}px` : width;
    if (height) style.height = /^\d+$/.test(height) ? `${height}px` : height;

    return (
      <img
        src={finalSrc}
        alt={alt || 'Content image'}
        style={style}
      />
    );
  } catch (error) {
    return <div className="text-red-500 border border-red-300 p-2 rounded">
      Image error: {error.message}
    </div>;
  }
}

export default _Image;