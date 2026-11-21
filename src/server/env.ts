import 'server-only';

import { z } from 'zod';

const KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** True when the text is canonical base64 for exactly 32 bytes (an AES-256 or HMAC-SHA-256 key). */
function isKey(text: string): boolean {
  if (!BASE64.test(text)) return false;
  const bytes = Buffer.from(text, 'base64');
  // Re-encoding rejects stray characters that Buffer would silently drop.
  return bytes.length === KEY_BYTES && bytes.toString('base64') === text;
}

const key = z
  .string()
  .refine(isKey, `must be base64 that decodes to exactly ${String(KEY_BYTES)} bytes`)
  .transform((text) => Buffer.from(text, 'base64'));

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  SEAL_KEY: key,
  FORM_KEY: key,
  OPENAQ_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL_READER: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_MODEL_WRITER: z.string().min(1).default('gemini-3.6-flash'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override readonly name = 'EnvError';
}

/**
 * Validates a set of variables. The error names each failing variable and says what is wrong
 * with it, and never includes a value, because a rejected secret is still a secret.
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  // A blank line such as `OPENAQ_API_KEY=` means "not set", not "set to nothing".
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(present);
  if (result.success) return result.data;

  const problems = result.error.issues.map(
    (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
  );
  throw new EnvError(`Invalid environment. ${problems.join('; ')}`);
}

// The parsed values are read-only and the process environment does not change while the
// server runs, so remembering them is not request state. The holder is filled on first use,
// which keeps `next build` from needing secrets it never reads.
const parsed: { current?: Env } = {};

export function getEnv(): Env {
  parsed.current ??= parseEnv(process.env);
  return parsed.current;
}
