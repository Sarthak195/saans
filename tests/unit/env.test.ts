import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvError, getEnv, parseEnv } from '@/server/env';

const key = (): string => randomBytes(32).toString('base64');

function valid(): Record<string, string> {
  return { SEAL_KEY: key(), FORM_KEY: key() };
}

function messageOf(source: Record<string, string>): string {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.message;
    throw error;
  }
  return '';
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('parseEnv', () => {
  it('applies defaults when only the required keys are present', () => {
    const env = parseEnv(valid());
    expect(env.GEMINI_MODEL_READER).toBe('gemini-3.5-flash-lite');
    expect(env.GEMINI_MODEL_WRITER).toBe('gemini-3.5-flash-lite');
    expect(env.GEMINI_MODEL_FALLBACK).toBe('gemini-3.1-flash-lite');
    expect(env.NODE_ENV).toBe('development');
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.OPENAQ_API_KEY).toBeUndefined();
  });

  it('decodes both keys to 32 bytes', () => {
    const env = parseEnv(valid());
    expect(env.SEAL_KEY).toHaveLength(32);
    expect(env.FORM_KEY).toHaveLength(32);
  });

  it('takes optional values when given', () => {
    const env = parseEnv({
      ...valid(),
      GEMINI_API_KEY: 'g-key',
      OPENAQ_API_KEY: 'o-key',
      GEMINI_MODEL_READER: 'reader-x',
      GEMINI_MODEL_WRITER: 'writer-y',
      NODE_ENV: 'production',
    });
    expect(env).toMatchObject({
      GEMINI_API_KEY: 'g-key',
      OPENAQ_API_KEY: 'o-key',
      GEMINI_MODEL_READER: 'reader-x',
      GEMINI_MODEL_WRITER: 'writer-y',
      NODE_ENV: 'production',
    });
  });

  it('treats a blank optional line as not set', () => {
    const env = parseEnv({ ...valid(), GEMINI_API_KEY: '', GEMINI_MODEL_READER: '' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL_READER).toBe('gemini-3.5-flash-lite');
  });

  it('names a missing key', () => {
    expect(messageOf({ FORM_KEY: key() })).toContain('SEAL_KEY');
  });

  it('rejects a key of the wrong length without printing it', () => {
    const short = randomBytes(16).toString('base64');
    const message = messageOf({ ...valid(), SEAL_KEY: short });
    expect(message).toContain('SEAL_KEY');
    expect(message).toContain('32 bytes');
    expect(message).not.toContain(short);
  });

  it('rejects text that is not base64 without printing it', () => {
    const secret = 'not base64 !!! secret-value';
    const message = messageOf({ ...valid(), FORM_KEY: secret });
    expect(message).toContain('FORM_KEY');
    expect(message).not.toContain('secret-value');
  });

  it('rejects a key padded with characters that base64 decoding would ignore', () => {
    expect(messageOf({ ...valid(), SEAL_KEY: `${key()}AAAA` })).toContain('SEAL_KEY');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(messageOf({ ...valid(), NODE_ENV: 'staging' })).toContain('NODE_ENV');
  });

  it('reports every failing variable at once', () => {
    const message = messageOf({});
    expect(message).toContain('SEAL_KEY');
    expect(message).toContain('FORM_KEY');
  });
});

describe('getEnv', () => {
  it('reads process.env on first use and then reuses the result', async () => {
    const seal = key();
    vi.stubEnv('SEAL_KEY', seal);
    vi.stubEnv('FORM_KEY', key());
    const { getEnv: fresh } = await import('@/server/env');
    const first = fresh();
    vi.stubEnv('SEAL_KEY', 'changed after first use');
    expect(fresh()).toBe(first);
    expect(first.SEAL_KEY.toString('base64')).toBe(seal);
  });

  it('fails fast when the environment is invalid', () => {
    vi.stubEnv('SEAL_KEY', '');
    vi.stubEnv('FORM_KEY', '');
    expect(() => getEnv()).toThrow(EnvError);
  });
});
