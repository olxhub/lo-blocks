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
};

export default nextConfig;
