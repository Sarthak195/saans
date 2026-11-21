import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server for the container image instead of shipping node_modules.
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
