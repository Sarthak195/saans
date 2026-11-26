// What every form route needs: the guarded read of a posted form, a 303 redirect, a plain page for
// a form that failed, and a text field reader. Server layer: no state, and the clock is passed in
// as `now`. The responses built here say `private, no-store`.
import 'server-only';

import { AppError, userMessage } from '@/server/errors';
import type { AppErrorKind } from '@/server/errors';
import { assertSameOrigin, readFormLimited, verifyFormToken } from '@/server/guards';

/**
 * The most bytes the route that reads a family's own words accepts, 16 KiB. A page of text in the
 * user's own words can reach about 14 KB once percent-encoded in Devanagari.
 */
export const ASK_MAX_BYTES = 16 * 1024;
/** The name of the hidden form field that carries the signed form token. */
export const FORM_TOKEN_FIELD = 'formToken';

// The HTTP status each known failure is answered with. A failure not listed here is a 502.
const STATUS: Partial<Record<AppErrorKind, number>> = {
  cross_origin: 403,
  body_too_large: 413,
  form_expired: 400,
  token_invalid: 400,
  token_too_large: 400,
  geocode_none: 422,
  geocode_ambiguous: 422,
  outside_india: 422,
  no_data: 502,
  upstream_timeout: 504,
};

// Keeps browsers and shared caches from storing a response that follows a family's form.
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** A 303 to a path on this site. The path stays relative so a proxy cannot turn it into another origin. */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, ...NO_STORE } });
}

/** Escapes the five characters that can open or close markup, as numeric character references. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

/** A link shown on a message page: where it goes and the words on it. */
export interface PageLink {
  href: string;
  label: string;
}

/**
 * A small, complete page for a form that could not be taken. A route handler cannot render React
 * here, so the page is plain markup; it uses the browser's own styles and no scripts.
 */
export function messagePage(
  status: number,
  message: { title: string; body: string; nextAction: string },
  links: readonly PageLink[],
): Response {
  // Every value that reaches the markup is escaped, including the link addresses.
  const items = links
    .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
    .join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(message.title)} | Saans</title></head>
<body><main><h1>${escapeHtml(message.title)}</h1><p>${escapeHtml(message.body)}</p><p>${escapeHtml(message.nextAction)}</p><ul>${items}</ul></main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  });
}

/** The page for a failed form, in plain words, with a way forward. Anything unexpected is rethrown. */
export function errorResponse(error: unknown, startAgain = '/'): Response {
  if (!(error instanceof AppError)) throw error;
  const message = userMessage(error.kind);
  // An expired form is offered "Start again"; every other failure is offered the home page.
  const label = error.kind === 'form_expired' ? 'Start again' : 'Go to the home page';
  return messagePage(STATUS[error.kind] ?? 502, message, [{ href: startAgain, label }]);
}

/** Runs a form handler so a known failure becomes its page and nothing else is swallowed. */
export async function handleForm(
  run: () => Promise<Response>,
  startAgain = '/',
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return errorResponse(error, startAgain);
  }
}

/** The checks every form POST goes through: same site, a capped body, and a form token we issued lately. */
export async function readGuardedForm(
  request: Request,
  now: Date,
  maxBytes?: number,
): Promise<FormData> {
  // The origin is checked before the body is read. The token is in the body, so it comes last.
  assertSameOrigin(request);
  const form = await readFormLimited(request, maxBytes);
  // verifyFormToken accepts a token signed with our key that is not too old and not too far ahead.
  const token = form.get(FORM_TOKEN_FIELD);
  if (typeof token !== 'string' || !verifyFormToken(token, now)) {
    throw new AppError('form_expired', 'form token missing, forged or old');
  }
  return form;
}

/** A text field, trimmed and capped; a missing or non-text field reads as empty. */
export function field(form: FormData, name: string, max = 200): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Runs a step and hands back the AppError instead of throwing it, so a page can show it without a try block around its markup. */
export async function settle<T>(run: () => Promise<T> | T): Promise<T | AppError> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
}
