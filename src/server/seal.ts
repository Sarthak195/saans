import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { householdSchema } from '@/core/profile/schema';
import type { Household } from '@/core/types';
import { getEnv } from '@/server/env';
import { AppError } from '@/server/errors';

// Layout of a token, before base64url: version byte, 12-byte IV, ciphertext, 16-byte GCM tag.
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_CHARS = 2000;
// A real household inflates to a few KiB. The cap stops a small token from expanding into memory.
const MAX_INFLATED_BYTES = 16 * 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Packs a household into a link-safe token. It is encrypted so a shared link does not show a
 * family's routines and conditions to anyone who reads the URL, and authenticated so it cannot
 * be edited by hand.
 */
export function sealHousehold(household: Household): string {
  const plain = deflateRawSync(Buffer.from(JSON.stringify(household), 'utf8'));
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.from([VERSION]);
  const cipher = createCipheriv('aes-256-gcm', getEnv().SEAL_KEY, iv, { authTagLength: TAG_BYTES });
  // The version byte is authenticated too, so it cannot be swapped without breaking the tag.
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const token = Buffer.concat([header, iv, body, cipher.getAuthTag()]).toString('base64url');
  if (token.length > MAX_TOKEN_CHARS) throw new AppError('token_too_large');
  return token;
}

function invalid(detail: string, cause?: unknown): AppError {
  return new AppError('token_invalid', detail, cause === undefined ? undefined : { cause });
}

/** Reverses sealHousehold. Every failure is a token_invalid, so a caller shows one friendly message. */
export function openHousehold(token: string): Household {
  // Length is checked first, before any decoding work is spent on a hostile input.
  if (token.length > MAX_TOKEN_CHARS) throw new AppError('token_too_large');
  if (!BASE64URL.test(token)) throw invalid('not base64url');

  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length < 1 + IV_BYTES + TAG_BYTES + 1) throw invalid('too short');
  if (bytes[0] !== VERSION) throw invalid('unknown version');

  const iv = bytes.subarray(1, 1 + IV_BYTES);
  const body = bytes.subarray(1 + IV_BYTES, bytes.length - TAG_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);

  let json: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', getEnv().SEAL_KEY, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(bytes.subarray(0, 1));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    json = inflateRawSync(plain, { maxOutputLength: MAX_INFLATED_BYTES }).toString('utf8');
  } catch (error) {
    throw invalid('authentication or inflate failed', error);
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw invalid('not JSON', error);
  }
  const parsed = householdSchema.safeParse(value);
  if (!parsed.success) throw invalid('not a household');
  return parsed.data;
}
