// Build and server settings for Next.js. Not part of the app's own layers: it only sets how the
// app is packaged and which response headers every plan page carries.
import type { NextConfig } from 'next';

/** The framework settings: strict mode, a standalone build, no framework banner, no-store plans. */
const nextConfig: NextConfig = {
  // Development only: React runs components and effects twice to surface unsafe side effects.
  reactStrictMode: true,
  // Emits a self-contained server for the container image instead of shipping node_modules.
  output: 'standalone',
  // Leaves out the "X-Powered-By: Next.js" response header.
  poweredByHeader: false,
  // A plan page holds a family profile in its address, so no cache keeps a copy of it.
  // "private, no-store" tells browsers, proxies and CDNs not to store the response at all.
  headers: () =>
    Promise.resolve([
      { source: '/plan/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ]),
};

export default nextConfig;
