// apps/static/next.config.mjs
//
// Static export configuration. Produces a self-contained static site
// (HTML + JS + CSS) in out/ that can be deployed to S3, CDN, GitHub Pages, etc.
//
/** @type {import('next').NextConfig} */
const basePath = process.env.STATIC_BASE_PATH || '';
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },  // next/image optimization requires a server
  transpilePackages: ['@lo-blocks/shared'],
  ...(basePath && { basePath }),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
