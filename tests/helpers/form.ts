import { randomBytes } from 'node:crypto';

import { vi } from 'vitest';

import { issueFormToken } from '@/server/guards';

export const ORIGIN = 'https://saans.test';
export const FORM_TYPE = 'application/x-www-form-urlencoded';

/** Sets the two keys the app reads from the environment. Call from beforeAll. */
export function stubKeys(): void {
  vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
}

/** A same-site form POST as a browser would send it, with a fresh form token unless one is given. */
export function formPost(
  path: string,
  fields: Record<string, string>,
  options: { token?: string; origin?: string | null } = {},
): Request {
  const body = new URLSearchParams({
    formToken: options.token ?? issueFormToken(new Date()),
    ...fields,
  }).toString();
  const headers: Record<string, string> = { 'content-type': FORM_TYPE };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body });
}

/** The path a 303 redirect points to. */
export function locationOf(response: Response): string {
  const location = response.headers.get('location');
  if (location === null) throw new Error(`No Location header (status ${String(response.status)})`);
  return location;
}
