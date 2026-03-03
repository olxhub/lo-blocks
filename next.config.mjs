// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for containerized deployments (AWS Amplify, Docker, etc.)
  // This bundles all dependencies into .next/standalone for a self-contained server
  // output: 'standalone',
  // Non-standalone is more robust for hosted deploys, which we're using right now

  // We include a toggle:
  ...(process.env.STANDALONE === 'true' && { output: 'standalone' }),

  // Static export for S3/CDN hosting (no server required)
  // Nominal usage: STATIC_EXPORT=true npx next build → output in out/
  //
  // The above fails on dynamic routes. If we move them, we can do a static
  // build. See, e.g. `npm run build:static` for an end-to-end workflow
  // (might be in a branch).
  ...(process.env.STATIC_EXPORT === 'true' && {
    output: 'export',
    images: { unoptimized: true },  // next/image optimization requires a server
  }),

  // Allow tests to use a separate build directory to avoid lock file conflicts
  // with user's dev server. Usage: NEXT_DIST_DIR=.next-test npx next dev
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
};

export default nextConfig;
