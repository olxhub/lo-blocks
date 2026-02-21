// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for containerized deployments (AWS Amplify, Docker, etc.)
  // This bundles all dependencies into .next/standalone for a self-contained server
  // output: 'standalone',
  // Non-standalone is more robust for hosted deploys, which we're using right now

  // We probably want:
  ...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
  // So we can toggle it.

  // Static export for S3/CDN hosting (no server required)
  // Usage: STATIC_EXPORT=true npx next build → output in out/
  ...(process.env.STATIC_EXPORT === 'true' && {
    output: 'export',
    images: { unoptimized: true },  // next/image optimization requires a server
  }),

  // Allow tests to use a separate build directory to avoid lock file conflicts
  // with user's dev server. Usage: NEXT_DIST_DIR=.next-test npx next dev
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
};

export default nextConfig;
