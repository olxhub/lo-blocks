// apps/static/next.config.mjs
//
// Static export configuration. Produces a self-contained static site
// (HTML + JS + CSS) in out/ that can be deployed to S3, CDN, GitHub Pages, etc.
//
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },  // next/image optimization requires a server
  transpilePackages: ['@lo-blocks/shared'],
};

export default nextConfig;
