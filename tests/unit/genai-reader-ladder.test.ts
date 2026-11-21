import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/server/errors';
import type { ModelCall } from '@/server/genai/model';
import { readWithDeps } from '@/server/genai/reader';
import type { ReaderResult } from '@/server/genai/types';

import { recorded, replyWith } from '../helpers/geocode';
import { INJECTION_TEXT, depsWith, loadFixture, sampleText } from '../helpers/genai';

afterEach(() => vi.restoreAllMocks());

function household(result: ReaderResult): Extract<ReaderResult, { kind: 'household' }> {
  if (result.kind !== 'household') throw new Error(`Expected a household, got ${result.kind}`);
  return result;
}

describe('the ladder', () => {
  const text = sampleText('s1');
  const fixture = loadFixture('reader-s1').reply;

  it('tries the fallback model when the first is out of quota', async () => {
    const models: string[] = [];
    const call: ModelCall = (request) => {
      models.push(request.model);
      return request.model === 'primary-model'
        ? Promise.reject(new AppError('genai_quota'))
        : Promise.resolve(fixture);
    };
    const result = household(await readWithDeps({ text }, depsWith(call)));
    expect(models).toEqual(['primary-model', 'fallback-model']);
    expect(result.by).toBe('gemini');
  });

  it.each(['genai_timeout', 'genai_unavailable'] as const)(
    'tries the fallback model after %s',
    async (kind) => {
      let calls = 0;
      const call: ModelCall = () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new AppError(kind)) : Promise.resolve(fixture);
      };
      expect(household(await readWithDeps({ text }, depsWith(call))).by).toBe('gemini');
      expect(calls).toBe(2);
    },
  );

  it('does not try the fallback after a blocked reply or one that does not fit the schema', async () => {
    for (const reply of [new AppError('genai_blocked'), 'not json at all', '{"members":3}']) {
      const call = vi.fn<ModelCall>(() =>
        reply instanceof AppError ? Promise.reject(reply) : Promise.resolve(reply),
      );
      const result = household(await readWithDeps({ text }, depsWith(call)));
      expect(call).toHaveBeenCalledTimes(1);
      expect(result.by).toBe('keywords');
    }
  });

  it('reads by keywords, with a note, when both models fail', async () => {
    const call = vi.fn<ModelCall>(() => Promise.reject(new AppError('genai_quota')));
    const result = household(await readWithDeps({ text }, depsWith(call)));
    expect(call).toHaveBeenCalledTimes(2);
    expect(result.by).toBe('keywords');
    expect(result.notes[0]).toMatch(/matching words, without the AI reader/);
    expect(result.household.place.name).toBe('Lajpat Nagar');
    expect(result.household.members.map((m) => m.label)).toEqual(['Son', 'Mother', 'Me']);
    expect(result.household.members[0]?.ageBand).toBe('child');
    expect(result.household.routines.map((r) => r.start)).toEqual(['17:00', '06:30', '08:30']);
  });

  it('reads by keywords without a key, and never calls out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = household(await readWithDeps({ text: sampleText('s2') }, depsWith(null)));
    expect(result.by).toBe('keywords');
    expect(result.household.routines.map((r) => [r.kind, r.start])).toEqual([
      ['sport', '06:00'],
      ['commute', '09:00'],
    ]);
    expect(result.household.members[0]?.ageBand).toBe('adult');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never lets the injected number through the keyword path either', async () => {
    const result = await readWithDeps({ text: INJECTION_TEXT }, depsWith(null));
    expect(JSON.stringify(result)).not.toMatch(/\b20\b/);
    expect(household(result).household.members).toEqual([
      expect.objectContaining({ label: 'Son', ageBand: 'child' }),
    ]);
  });
});

describe('the place', () => {
  const text = 'My son is 7 and plays cricket at 5 pm.';
  const body = (place: string): string =>
    JSON.stringify({
      place: { value: place, quote: place },
      members: [
        { label: { value: 'son', quote: 'son' }, years: { value: 7, quote: '7' }, conditions: [] },
      ],
      routines: [],
      home: { habits: [] },
    });
  const call =
    (reply: string): ModelCall =>
    () =>
      Promise.resolve(reply);

  it('uses the place the family chose in the form over the text', async () => {
    const result = household(
      await readWithDeps(
        {
          text: `${text} We live in Lajpat Nagar.`,
          place: {
            name: 'Mumbai',
            admin1: 'Maharashtra',
            lat: 19.07,
            lon: 72.88,
            source: 'static',
          },
        },
        depsWith(call(body('Lajpat Nagar'))),
      ),
    );
    expect(result.household.place).toEqual({
      name: 'Mumbai',
      admin1: 'Maharashtra',
      lat: 19.1,
      lon: 72.9,
    });
  });

  it('asks the family to choose when several places share the name', async () => {
    replyWith(recorded('rampur'));
    const result = await readWithDeps(
      { text: `${text} We live in Rampur.` },
      depsWith(call(body('Rampur'))),
    );
    expect(result.kind).toBe('choose_place');
    if (result.kind === 'choose_place') expect(result.options.length).toBeGreaterThan(1);
  });

  it('gives the form when no place was given or found', async () => {
    const result = await readWithDeps(
      { text },
      depsWith(call(JSON.stringify({ ...(JSON.parse(body('x')) as object), place: undefined }))),
    );
    expect(result.kind === 'form' ? result.reason : '').toContain('city or area');
  });

  it('gives the form, not an error, when the place lookup is down', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const result = await readWithDeps(
      { text: `${text} We live in Nowheresville.` },
      depsWith(call(body('Nowheresville'))),
    );
    expect(result.kind).toBe('form');
  });

  it('gives the form for an empty text', async () => {
    expect((await readWithDeps({ text: '   ' }, depsWith(null))).kind).toBe('form');
  });
});
