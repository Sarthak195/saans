import 'server-only';

import { AppError, userMessage } from '@/server/errors';
import type { AppErrorKind } from '@/server/errors';
import { assertSameOrigin, readFormLimited, verifyFormToken } from '@/server/guards';

/** A page of text in the user's own words can reach about 14 KB once percent-encoded in Devanagari. */
export const ASK_MAX_BYTES = 16 * 1024;
export const FORM_TOKEN_FIELD = 'formToken';

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

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** A 303 to a path on this site. The path stays relative so a proxy cannot turn it into another origin. */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, ...NO_STORE } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

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
  assertSameOrigin(request);
  const form = await readFormLimited(request, maxBytes);
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
