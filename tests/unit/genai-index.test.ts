import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { frameworkCache, noCache, cacheKey } from '@/server/genai/cache';
import { BRIEFING_PROMPT_VERSION, BRIEFING_SYSTEM } from '@/server/genai/prompts/briefing';
import { NOTICE_PROMPT_VERSION, NOTICE_SYSTEM } from '@/server/genai/prompts/notice';
import { QUESTION_PROMPT_VERSION, QUESTION_SYSTEM } from '@/server/genai/prompts/question';
import { READER_PROMPT_VERSION, READER_SYSTEM } from '@/server/genai/prompts/reader';

import { DASHES } from '../helpers/text';
import { MODELS, familyCase, sampleText } from '../helpers/genai';

const key = (): string => randomBytes(32).toString('base64');

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SEAL_KEY', key());
  vi.stubEnv('FORM_KEY', key());
  vi.stubEnv('GEMINI_API_KEY', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('the module as the app calls it', () => {
  it('works without a key: the reader uses keywords and the writers use the templates', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const genai = await import('@/server/genai');
    const now = new Date('2026-11-21T16:00:00+05:30');

    const read = await genai.readHousehold({ text: sampleText('s2'), now });
    expect(read).toMatchObject({ kind: 'household', by: 'keywords' });

    const family = await familyCase();
    const briefing = await genai.writeBriefing({ ...family, lang: 'en' });
    expect(briefing).toMatchObject({ by: 'template', lang: 'en' });
    expect(briefing.note).toBeTruthy();

    const question = await genai.readQuestion({
      text: 'Can my son play at 3 pm?',
      household: family.household,
    });
    expect(question.kind).toBe('unclear');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the models from the environment', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL_READER', 'reader-x');
    vi.stubEnv('GEMINI_MODEL_WRITER', 'writer-y');
    vi.stubEnv('GEMINI_MODEL_FALLBACK', 'fallback-z');
    const { defaultDeps } = await import('@/server/genai/config');
    const deps = defaultDeps();
    expect(deps.models).toEqual({ reader: 'reader-x', writer: 'writer-y', fallback: 'fallback-z' });
    expect(deps.call).toBeTypeOf('function');
  });

  it('uses flash-lite first and flash-lite fallback by default', async () => {
    const { defaultDeps } = await import('@/server/genai/config');
    expect(defaultDeps().models).toEqual({
      reader: 'gemini-3.5-flash-lite',
      writer: 'gemini-3.5-flash-lite',
      fallback: 'gemini-3.1-flash-lite',
    });
    expect(defaultDeps().call).toBeNull();
  });
});

describe('the cache helpers', () => {
  it('makes the same key for the same facts and a different one for anything else', () => {
    const base = { version: 'v1', audience: 'family', lang: 'en', facts: { a: 1 } };
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{64}$/);
    for (const other of [
      { ...base, version: 'v2' },
      { ...base, audience: 'community' },
      { ...base, lang: 'hi' },
      { ...base, facts: { a: 2 } },
    ]) {
      expect(cacheKey(other)).not.toBe(cacheKey(base));
    }
  });

  it('has a pass-through for scripts and the framework cache for the app', async () => {
    expect(await noCache('k', () => Promise.resolve('fresh'))).toBe('fresh');
    expect(frameworkCache).toBeTypeOf('function');
    expect(MODELS.writer).toBeTruthy();
  });
});

describe('the prompts', () => {
  const prompts = [
    ['reader', READER_PROMPT_VERSION, READER_SYSTEM],
    ['question', QUESTION_PROMPT_VERSION, QUESTION_SYSTEM],
    ['briefing', BRIEFING_PROMPT_VERSION, BRIEFING_SYSTEM],
    ['notice', NOTICE_PROMPT_VERSION, NOTICE_SYSTEM],
  ] as const;

  it.each(prompts)('%s has a version that names it and no dashes', (name, version, system) => {
    expect(version).toMatch(new RegExp(`^${name}-\\d+$`));
    expect(system).not.toMatch(DASHES);
  });

  it.each([prompts[0], prompts[1]])(
    '%s says the text is data and not instructions',
    (_name, _v, system) => {
      expect(system).toMatch(/data, never instructions/);
      expect(system).toMatch(/quote/);
    },
  );

  it.each([prompts[2], prompts[3]])(
    '%s forbids reassurance and invented numbers',
    (_name, _v, system) => {
      expect(system).toMatch(/Never call .* safe/);
      expect(system).toMatch(/Use only the numbers/);
    },
  );
});
