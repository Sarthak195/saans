import { createCipheriv, randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { SAMPLES } from '@/core/profile/samples';
import { openHousehold, sealHousehold } from '@/server/seal';
import { AppError } from '@/server/errors';

beforeAll(() => {
  vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
});

function kindOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    // Matched by name too: a module loaded after resetModules has its own AppError class.
    if (error instanceof AppError || (error instanceof Error && error.name === 'AppError')) {
      return (error as AppError).kind;
    }
    throw error;
  }
  return 'no error';
}

const s1 = SAMPLES[0];
if (s1 === undefined) throw new Error('no samples');

describe('sealHousehold and openHousehold', () => {
  it.each(SAMPLES.map((s) => [s.id, s.household] as const))('round-trips %s', (_id, household) => {
    expect(openHousehold(sealHousehold(household))).toEqual(household);
  });

  it('keeps a sealed S1 well under the 2,000 character limit, in link-safe characters', () => {
    const token = sealHousehold(s1.household);
    expect(token.length).toBeLessThan(2000);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('makes a different token each time, so two links to one family do not match', () => {
    expect(sealHousehold(s1.household)).not.toBe(sealHousehold(s1.household));
  });

  it('does not show the family in the clear', () => {
    const token = sealHousehold(s1.household);
    expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('Lajpat');
  });

  it('rejects a token with any one byte changed', () => {
    // Changed as bytes, not as text: the last base64 character can differ only in padding bits,
    // which decode to the same bytes.
    const bytes = Buffer.from(sealHousehold(s1.household), 'base64url');
    for (const index of [0, 1, 15, Math.floor(bytes.length / 2), bytes.length - 1]) {
      const changed = Buffer.from(bytes);
      changed[index] = (changed[index] ?? 0) ^ 1;
      const tampered = changed.toString('base64url');
      expect(
        kindOf(() => openHousehold(tampered)),
        `index ${String(index)}`,
      ).toBe('token_invalid');
    }
  });

  it('rejects a token from another version', () => {
    const bytes = Buffer.from(sealHousehold(s1.household), 'base64url');
    bytes[0] = 2;
    expect(kindOf(() => openHousehold(bytes.toString('base64url')))).toBe('token_invalid');
  });

  it('rejects a token over 2,000 characters before decoding it', () => {
    expect(kindOf(() => openHousehold('A'.repeat(2001)))).toBe('token_too_large');
    expect(kindOf(() => openHousehold('!'.repeat(2001)))).toBe('token_too_large');
  });

  it('rejects text that is not a token, an empty string and a truncated token', () => {
    expect(kindOf(() => openHousehold(''))).toBe('token_invalid');
    expect(kindOf(() => openHousehold('not a token!'))).toBe('token_invalid');
    expect(kindOf(() => openHousehold('AQID'))).toBe('token_invalid');
    const token = sealHousehold(s1.household);
    expect(kindOf(() => openHousehold(token.slice(0, 40)))).toBe('token_invalid');
  });

  it('rejects a token sealed under another key', () => {
    const token = sealHousehold(s1.household);
    vi.resetModules();
    vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
    return import('@/server/seal').then((other) => {
      expect(kindOf(() => other.openHousehold(token))).toBe('token_invalid');
    });
  });
});

describe('openHousehold with validly sealed but unacceptable content', () => {
  // Builds a genuine token around arbitrary bytes, using the same layout and key.
  async function sealRaw(plain: Buffer): Promise<string> {
    const { getEnv } = await import('@/server/env');
    const iv = randomBytes(12);
    const header = Buffer.from([1]);
    const cipher = createCipheriv('aes-256-gcm', getEnv().SEAL_KEY, iv, { authTagLength: 16 });
    cipher.setAAD(header);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([header, iv, body, cipher.getAuthTag()]).toString('base64url');
  }

  it('refuses JSON that is not a household', async () => {
    const token = await sealRaw(deflateRawSync(Buffer.from('{"v":1}')));
    expect(kindOf(() => openHousehold(token))).toBe('token_invalid');
  });

  it('refuses text that is not JSON', async () => {
    const token = await sealRaw(deflateRawSync(Buffer.from('not json')));
    expect(kindOf(() => openHousehold(token))).toBe('token_invalid');
  });

  it('refuses bytes that do not inflate', async () => {
    const token = await sealRaw(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    expect(kindOf(() => openHousehold(token))).toBe('token_invalid');
  });

  it('refuses a small token that would inflate past 16 KiB', async () => {
    const token = await sealRaw(deflateRawSync(Buffer.alloc(64 * 1024, 0x20)));
    expect(token.length).toBeLessThan(2000);
    expect(kindOf(() => openHousehold(token))).toBe('token_invalid');
  });
});

describe('sealHousehold with an oversized household', () => {
  it('throws token_too_large when the token would pass the limit', () => {
    // Random-looking text does not deflate, so a long note pushes the token over the cap.
    const note = randomBytes(1500).toString('base64').slice(0, 1500);
    const big = { ...s1.household, question: note };
    expect(kindOf(() => sealHousehold(big))).toBe('token_too_large');
  });
});
