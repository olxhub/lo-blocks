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
import React from 'react';
import NextImage from 'next/image';
import { resolveImageSrc } from '@/lib/util';

function _Image(props) {
  const { src, alt, width, height, nodeInfo } = props;

  if (!src) {
    return <div className="text-red-500 border border-red-300 p-2 rounded">
      ❌ Image error: src attribute required
    </div>;
  }

  try {
    const resolved = resolveImageSrc(src);

    let finalSrc;
    switch (resolved.type) {
      case 'external':
        finalSrc = resolved.src;
        break;
      case 'platform':
        finalSrc = `/${resolved.src}`;
        break;
      case 'content':
        finalSrc = `/content/${resolved.src}`;
        break;
    }

    // Only pass explicitly defined image-related props
    return (
      <NextImage
        src={finalSrc}
        alt={alt || 'Content image'}
        width={width ? parseInt(width) : 400}
        height={height ? parseInt(height) : 300}
        className="max-w-full h-auto"
      />
    );
  } catch (error) {
    return <div className="text-red-500 border border-red-300 p-2 rounded">
      ❌ Image error: {error.message}
    </div>;
  }
}

export default _Image;