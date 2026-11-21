import { NextResponse, type NextRequest } from 'next/server';

import { buildSecurityHeaders, createNonce } from '@/server/security-headers';

const STATIC_FILE = /\.[A-Za-z0-9]+$/;

export function proxy(request: NextRequest): NextResponse {
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
  for (const [name, value] of Object.entries(security)) response.headers.set(name, value);
  // Pages and the forms behind them can hold a family's details, so no cache keeps a copy. Files
  // such as a robots.txt have an extension and stay cacheable.
  if (!STATIC_FILE.test(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

// Static build output and icons are served as files, where a document policy governs nothing.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon\\.|apple-icon\\.).*)'],
};
