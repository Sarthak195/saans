// Next's per-request hook. It gives every response a fresh nonce and the security headers, and
// keeps pages out of caches. It holds no state between requests.
import { NextResponse, type NextRequest } from 'next/server';

import { buildSecurityHeaders, createNonce } from '@/server/security-headers';

// Matches a path that ends in a file extension, such as '/robots.txt'.
const STATIC_FILE = /\.[A-Za-z0-9]+$/;

/**
 * Runs for each request the matcher selects: makes a nonce, passes the policy to Next on the
 * request, sets the security headers on the response and marks pages private and uncacheable.
 * Returns the response to continue with.
 */
export function proxy(request: NextRequest): NextResponse {
  // A fresh nonce for every request, used in the policy and in the scripts Next renders.
  const nonce = createNonce();
  const security = buildSecurityHeaders({
    nonce,
    isProduction: process.env.NODE_ENV === 'production',
  });

  // Next reads the nonce from the policy on the request and stamps it on its own scripts, so
  // the header sent out and the attributes in the HTML come from one value.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', security['Content-Security-Policy']);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Every security header goes on the response, the policy that carries the nonce included.
  for (const [name, value] of Object.entries(security)) response.headers.set(name, value);
  // Pages and the forms behind them can hold a family's details, so no cache keeps a copy. Files
  // such as a robots.txt have an extension and stay cacheable.
  if (!STATIC_FILE.test(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

/**
 * Selects the paths the proxy runs for: every path except Next's static files, its image route,
 * the favicon and the icon files. Those are served as files, where a document policy governs
 * nothing.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon\\.|apple-icon\\.).*)'],
};
