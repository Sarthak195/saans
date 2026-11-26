// The server's configuration: which environment variables exist, what each must look like, and
// the one place they are read. Server layer. Errors name a variable and never print its value.
import 'server-only';

import { z } from 'zod';

// Both secret keys are 32 bytes: the size of an AES-256 key and of an HMAC-SHA-256 key.
const KEY_BYTES = 32;
// Standard base64 text: letters, digits, plus and slash, then at most two padding signs.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * True when the text is canonical base64 for exactly 32 bytes (an AES-256 or HMAC-SHA-256 key).
 */
function isKey(text: string): boolean {
  if (!BASE64.test(text)) return false;
  const bytes = Buffer.from(text, 'base64');
  // Re-encoding rejects stray characters that Buffer would silently drop.
  return bytes.length === KEY_BYTES && bytes.toString('base64') === text;
}

// A secret key as a validated base64 string, turned into raw bytes once it passes.
const key = z
  .string()
  .refine(isKey, `must be base64 that decodes to exactly ${String(KEY_BYTES)} bytes`)
  .transform((text) => Buffer.from(text, 'base64'));

// Every variable the server reads. The two API keys are optional (without them the Gemini jobs and
// the monitor reading are skipped). SEAL_KEY seals household links and written text; FORM_KEY
// signs form tokens. The three model names have defaults. NODE_ENV defaults to development.
const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  SEAL_KEY: key,
  FORM_KEY: key,
  OPENAQ_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL_READER: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_MODEL_WRITER: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_MODEL_FALLBACK: z.string().min(1).default('gemini-3.1-flash-lite'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

/** The validated environment: the two keys as 32-byte buffers, the rest as strings. */
export type Env = z.infer<typeof envSchema>;

/** Thrown when the environment is invalid. Its message lists each bad variable, never a value. */
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
  // safeParse collects every problem at once, so one run of the server names them all.
  const result = envSchema.safeParse(present);
  if (result.success) {
    // One value for both jobs would make a leak of either key a leak of both, so it is refused.
    if (result.data.SEAL_KEY.equals(result.data.FORM_KEY)) {
      throw new EnvError('Invalid environment. FORM_KEY: must differ from SEAL_KEY');
    }
    return result.data;
  }

  // Each problem reads "VARIABLE: what is wrong".
  const problems = result.error.issues.map(
    (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
  );
  throw new EnvError(`Invalid environment. ${problems.join('; ')}`);
}

// The parsed values are read-only and the process environment does not change while the
// server runs, so remembering them is not request state. The holder is filled on first use,
// which keeps `next build` from needing secrets it never reads.
const parsed: { current?: Env } = {};

/**
 * The validated process environment, read and checked on first use and then reused. Throws an
 * EnvError when a variable is missing or malformed.
 */
export function getEnv(): Env {
  parsed.current ??= parseEnv(process.env);
  return parsed.current;
}
