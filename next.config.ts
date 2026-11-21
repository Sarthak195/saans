import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server for the container image instead of shipping node_modules.
  output: 'standalone',
  poweredByHeader: false,
  // A plan page holds a family profile in its address, so no cache keeps a copy of it.
  headers: () =>
    Promise.resolve([
      { source: '/plan/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ]),
};

export default nextConfig;
