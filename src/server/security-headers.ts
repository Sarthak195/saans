export interface HeaderOptions {
  /** Fresh for every response: a nonce that repeats can be copied from one page onto an injected script. */
  readonly nonce: string;
  readonly isProduction: boolean;
}

/** 128 bits from the platform's CSPRNG, base64 encoded (valid in a CSP nonce source). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Built per request because script-src and style-src carry the nonce. 'strict-dynamic' lets the
 * nonced bootstrap script load Next's chunks without listing each one.
 */
export function buildContentSecurityPolicy({ nonce, isProduction }: HeaderOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // React's development build rebuilds server stack traces with eval; production never needs it.
  if (!isProduction) scriptSrc.push("'unsafe-eval'");

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

/** Every security header the app sets on a response, including the policy. */
export function buildSecurityHeaders(
  options: HeaderOptions,
): Record<string, string> & { readonly 'Content-Security-Policy': string } {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // Location is requested only by the "use my location" button, from this origin.
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
