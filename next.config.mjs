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

  // Allow tests to use a separate build directory to avoid lock file conflicts
  // with user's dev server. Usage: NEXT_DIST_DIR=.next-test npx next dev
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),

  // esbuild has native binaries that shouldn't be bundled by Next.js
  // It's only used server-side in API routes
  serverExternalPackages: ['esbuild'],
};

export default nextConfig;
