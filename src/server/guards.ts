// Guards for the routes that take a form post: a capped body reader, a same-origin check, and the
// signed form token. Server layer (I/O). Nothing is stored: a token proves itself by its
// signature.
import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getEnv } from '@/server/env';
import { AppError } from '@/server/errors';

// The only body type readFormLimited accepts.
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
// A form token stops being accepted 30 minutes after it was issued.
const FORM_MAX_AGE_SECONDS = 30 * 60;
// A little clock difference between instances is normal; a token from further ahead is forged.
const FORM_MAX_FUTURE_SECONDS = 60;

/** Counts bytes as they stream in, so a body with no or a false Content-Length is still capped. */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Stop reading at once so an oversized upload is not pulled in to the end.
      await reader.cancel();
      throw new AppError('body_too_large', 'body over the byte cap');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads a urlencoded form body with a hard byte cap (8 KiB unless the caller sets another).
 * Any other content type is refused as too large. Throws a body_too_large AppError; returns the
 * fields as FormData.
 */
export async function readFormLimited(request: Request, maxBytes = 8192): Promise<FormData> {
  // The part before any ';' is the type, e.g. "application/x-www-form-urlencoded; charset=UTF-8".
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== FORM_CONTENT_TYPE) throw new AppError('body_too_large', 'not a urlencoded form');

  // A declared length over the cap is refused before any byte is read. The count while reading
  // still applies, because the header can be missing or wrong.
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    throw new AppError('body_too_large', 'Content-Length over the byte cap');
  }

  const text = await readCapped(request.body, maxBytes);
  const form = new FormData();
  for (const [name, value] of new URLSearchParams(text)) form.append(name, value);
  return form;
}

/** The first value of a header a proxy may have turned into a comma list. */
function firstHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.split(',')[0]?.trim();
  return value === undefined || value === '' ? null : value;
}

/**
 * This site's own origin. The host comes from the Host header only, because a client can send any
 * X-Forwarded-Host; the platform's proxy is trusted for the scheme alone.
 */
function ownOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = firstHeader(request, 'host') ?? url.host;
  // url.protocol ends in a colon ("https:"); the regular expression drops it to give "https".
  const proto = firstHeader(request, 'x-forwarded-proto') ?? url.protocol.replace(/:$/, '');
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Refuses a request that another site could have sent from a visitor's browser. The Origin
 * header must be this site's own. A missing Origin, or the literal 'null' that browsers send from
 * opaque contexts such as sandboxed frames, counts only when the browser says the request is
 * same-origin.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin === null || origin === 'null') {
    // Sec-Fetch-Site is set by the browser, not the page. 'same-origin' is accepted for either
    // case; 'none' (the visitor acted directly, not through a page) only when Origin is missing.
    const site = request.headers.get('sec-fetch-site');
    if (site === 'same-origin' || (origin === null && site === 'none')) return;
    throw new AppError('cross_origin', 'no usable Origin and not a same-origin fetch');
  }
  if (origin !== ownOrigin(request)) throw new AppError('cross_origin', 'Origin is not this site');
}

/** The HMAC-SHA-256 of the issue time, under the form key. */
function sign(issuedAt: string): Buffer {
  return createHmac('sha256', getEnv().FORM_KEY).update(issuedAt).digest();
}

/** Whole seconds since 1970 for a moment, rounded down. */
function seconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

/**
 * A form token proves the page was served by us recently. It carries no user data: the text is
 * the issue time in seconds, a full stop, and the signature in base64url.
 */
export function issueFormToken(now: Date): string {
  const issuedAt = String(seconds(now));
  return `${issuedAt}.${sign(issuedAt).toString('base64url')}`;
}

/**
 * True when a token was signed with our form key and is neither older than 30 minutes nor more
 * than a minute ahead of this clock. Any malformed or forged token is false, never an error.
 */
export function verifyFormToken(token: string, now: Date): boolean {
  const parts = token.split('.');
  const [issuedAt, signature] = parts;
  if (parts.length !== 2 || issuedAt === undefined || signature === undefined) return false;
  // The issue time is digits only, 1 to 12 of them (such as 1764000000). It is checked before
  // the signature is computed.
  if (!/^\d{1,12}$/.test(issuedAt)) return false;

  const given = Buffer.from(signature, 'base64url');
  const expected = sign(issuedAt);
  // Decoding ignores stray characters, so insist the text is the canonical encoding too.
  if (given.toString('base64url') !== signature) return false;
  // timingSafeEqual throws on unequal lengths, so a wrong length is a plain mismatch.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  // The signature is good, so only the age is left to check: not too old, not from the future.
  const age = seconds(now) - Number(issuedAt);
  return age <= FORM_MAX_AGE_SECONDS && age >= -FORM_MAX_FUTURE_SECONDS;
}
