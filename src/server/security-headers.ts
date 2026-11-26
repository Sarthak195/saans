// Builds the security headers for every response, including the Content-Security-Policy and its
// per-request nonce. Server layer. It uses only web-standard APIs (crypto and btoa) and is
// called by the request proxy. The caller passes the nonce and the environment.

/** What the headers depend on: this response's nonce, and whether this is production. */
export interface HeaderOptions {
  /**
   * Fresh for every response: a nonce that repeats can be copied from one page onto an injected
   * script.
   */
  readonly nonce: string;
  readonly isProduction: boolean;
}

/** 128 bits from the platform's CSPRNG, base64 encoded (valid in a CSP nonce source). */
export function createNonce(): string {
  // 16 bytes is 128 bits; btoa turns the bytes into base64 text.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The Content-Security-Policy text for one response. Built per request because script-src and
 * style-src carry the nonce. 'strict-dynamic' lets the nonced bootstrap script load Next's chunks
 * without listing each one.
 */
export function buildContentSecurityPolicy({ nonce, isProduction }: HeaderOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // React's development build rebuilds server stack traces with eval; production never needs it.
  if (!isProduction) scriptSrc.push("'unsafe-eval'");

  // Everything defaults to this site's own origin. Images may also be data: URIs. No site may
  // frame the page, forms post only here, there is no base address and no plug-in content.
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ];
  // Plain-http localhost development would break if every request were upgraded to https.
  if (isProduction) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

/**
 * Every security header the app sets on a response, including the policy, as a name to value
 * map. The proxy copies it onto the response.
 */
export function buildSecurityHeaders(
  options: HeaderOptions,
): Record<string, string> & { readonly 'Content-Security-Policy': string } {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    // Browsers keep using https for two years (63,072,000 seconds), subdomains included.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    // Forms post with a real Origin under this policy, while sealed links never reach another
    // site.
    'Referrer-Policy': 'same-origin',
    // Location is requested only by the "use my location" button, from this origin.
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
