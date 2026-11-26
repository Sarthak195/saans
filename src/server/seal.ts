// Seals a household, a draft or a piece of written text into a link-safe token, and opens one
// again. Server layer: the key comes from the environment and nothing is stored, because the token
// itself carries the data, encrypted and authenticated (AES-256-GCM). See ADR 0004.
import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { z } from 'zod';

import { householdSchema, MAX_TEXT, placeSchema } from '@/core/profile/schema';
import type { Household } from '@/core/types';
import { getEnv } from '@/server/env';
import { AppError } from '@/server/errors';

// Layout of a token, before base64url: version byte, 12-byte IV, ciphertext, 16-byte GCM tag.
const HOUSEHOLD_VERSION = 1;
// A draft has its own version byte, so a draft token can never open as a household or the reverse.
const DRAFT_VERSION = 2;
// Written text has its own version too, so a draft or a household can never open as written text.
const WRITTEN_VERSION = 3;
// The size, in bytes, of the random IV and of the GCM tag.
const IV_BYTES = 12;
const TAG_BYTES = 16;
// The longest token, in characters, that is made or opened: it has to fit in a link.
const MAX_TOKEN_CHARS = 2000;
// A real household inflates to a few KiB. The cap stops a small token from expanding into memory.
const MAX_INFLATED_BYTES = 16 * 1024;
// A token holds only letters, digits, "-" and "_".
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Turns a value into a token: JSON, deflated, then encrypted with a fresh random IV. Throws
 * token_too_large when the token would be longer than 2000 characters.
 */
function seal(value: unknown, version: number): string {
  // Compressing first keeps the token short.
  const plain = deflateRawSync(Buffer.from(JSON.stringify(value), 'utf8'));
  // A new IV for every token: GCM must never reuse an IV with the same key.
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.from([version]);
  const cipher = createCipheriv('aes-256-gcm', getEnv().SEAL_KEY, iv, { authTagLength: TAG_BYTES });
  // The version byte is authenticated too, so it cannot be swapped without breaking the tag.
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const token = Buffer.concat([header, iv, body, cipher.getAuthTag()]).toString('base64url');
  if (token.length > MAX_TOKEN_CHARS) throw new AppError('token_too_large');
  return token;
}

/** A token_invalid error with a detail for the log; the family sees one friendly message. */
function invalid(detail: string, cause?: unknown): AppError {
  return new AppError('token_invalid', detail, cause === undefined ? undefined : { cause });
}

/**
 * Opens a token of the given version and checks the value against a schema. Every failure is a
 * token_invalid (or token_too_large), whether the token was cut, edited, made for another kind of
 * value or sealed with another key; `what` names the value in the detail.
 */
function open<T>(token: string, version: number, schema: z.ZodType<T>, what: string): T {
  // Length is checked first, before any decoding work is spent on a hostile input.
  if (token.length > MAX_TOKEN_CHARS) throw new AppError('token_too_large');
  if (!BASE64URL.test(token)) throw invalid('not base64url');

  const bytes = Buffer.from(token, 'base64url');
  // A token needs at least the version byte, the IV, the tag and one byte of ciphertext.
  if (bytes.length < 1 + IV_BYTES + TAG_BYTES + 1) throw invalid('too short');
  if (bytes[0] !== version) throw invalid('unknown version');

  // The layout is the one seal writes: version, IV, ciphertext, tag.
  const iv = bytes.subarray(1, 1 + IV_BYTES);
  const body = bytes.subarray(1 + IV_BYTES, bytes.length - TAG_BYTES);
  const tag = bytes.subarray(bytes.length - TAG_BYTES);

  let json: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', getEnv().SEAL_KEY, iv, {
      authTagLength: TAG_BYTES,
    });
    // The same version byte that seal authenticated; a changed byte makes final() throw.
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
  // Decrypting proves we made the token, but the value is still checked against its schema.
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalid(`not ${what}`);
  return parsed.data;
}

/**
 * Packs a household into a link-safe token. It is encrypted so a shared link does not show a
 * family's routines and conditions to anyone who reads the URL, and authenticated so it cannot
 * be edited by hand.
 */
export function sealHousehold(household: Household): string {
  return seal(household, HOUSEHOLD_VERSION);
}

/** Reverses sealHousehold. Every failure is a token_invalid, so a caller shows one friendly message. */
export function openHousehold(token: string): Household {
  return open(token, HOUSEHOLD_VERSION, householdSchema, 'a household');
}

// The most places a draft can hold for a family to choose from.
const MAX_DRAFT_OPTIONS = 5;
// The shape of a draft. Strict, and every text has a length cap.
const draftSchema = z.strictObject({
  text: z.string().max(MAX_TEXT),
  /** Places to choose from, when more than one matched what was typed. */
  options: z.array(placeSchema).max(MAX_DRAFT_OPTIONS),
  /** Why the text could not be turned into a plan straight away. */
  reason: z.string().max(300).optional(),
  /** The household form as it was sent, by field name, so a form with mistakes keeps what was typed. */
  values: z.record(z.string().max(40), z.string().max(200)).optional(),
  errors: z
    .array(z.strictObject({ field: z.string().max(40), message: z.string().max(200) }))
    .max(40)
    .optional(),
});

/** What is carried between a reading that needs one more answer and the page that asks for it. */
export type Draft = z.infer<typeof draftSchema>;

/** Seals a value with a text field, cutting the text until the token fits: a long Devanagari text can overflow a link. */
function sealCutting(value: { text: string }, version: number): string {
  let text = value.text;
  // Retries with the text cut shorter until the token fits, or the text is under 50 characters.
  for (;;) {
    try {
      return seal({ ...value, text }, version);
    } catch (error) {
      if (!(error instanceof AppError && error.kind === 'token_too_large') || text.length < 50) {
        throw error;
      }
      // Keeps four fifths of the text on each pass.
      text = text.slice(0, Math.floor(text.length * 0.8));
    }
  }
}

/** Seals a draft into a token. The text in it is cut when it would not otherwise fit a link. */
export function sealDraft(draft: Draft): string {
  return sealCutting(draft, DRAFT_VERSION);
}

/** Reverses sealDraft. Every failure is a token_invalid, and a household token does not open. */
export function openDraft(token: string): Draft {
  return open(token, DRAFT_VERSION, draftSchema, 'a draft');
}

// The shape of sealed written text. `binding` is 43 base64url characters, a 32-byte hash.
const writtenSchema = z.strictObject({
  text: z.string().max(MAX_TEXT),
  /** Who wrote it, in which language, and any note to show beside it. */
  by: z.enum(['gemini', 'template']),
  lang: z.enum(['en', 'hi']),
  note: z.string().max(300).optional(),
  /** Hash of what the text was written for, so it cannot be shown beside another plan. */
  binding: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  /** Seconds since the epoch when it was sealed. */
  issuedAt: z.number().int().nonnegative(),
});

/** A written summary or notice together with the binding that ties it to one plan. */
export type SealedWritten = z.infer<typeof writtenSchema>;

/** The text is cut if it cannot fit; the caller compares what comes back and swaps in plain text when it differs. */
export function sealWrittenText(written: SealedWritten): string {
  return sealCutting(written, WRITTEN_VERSION);
}

/**
 * Reverses sealWrittenText. Every failure is a token_invalid, and a draft or a household token
 * does not open as written text.
 */
export function openWrittenText(token: string): SealedWritten {
  return open(token, WRITTEN_VERSION, writtenSchema, 'written text');
}
