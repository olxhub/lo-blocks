// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for containerized deployments (AWS Amplify, Docker, etc.)
  // This bundles all dependencies into .next/standalone for a self-contained server
  output: 'standalone',
};

export default nextConfig;
