import { afterEach, describe, expect, it, vi } from 'vitest';

import { quoteInText } from '@/core/text';
import { AppError } from '@/server/errors';
import type { ModelCall, ModelRequest } from '@/server/genai/model';
import { readWithDeps } from '@/server/genai/reader';
import type { ReaderResult } from '@/server/genai/types';

import { recorded, replyWith } from '../helpers/geocode';
import { INJECTION_TEXT, depsWith, loadFixture, replay, sampleText } from '../helpers/genai';

afterEach(() => vi.restoreAllMocks());

function household(result: ReaderResult): Extract<ReaderResult, { kind: 'household' }> {
  if (result.kind !== 'household') throw new Error(`Expected a household, got ${result.kind}`);
  return result;
}

/** Every { value, quote } pair in a recorded reply. */
function quotedPairs(node: unknown, found: { value: unknown; quote: string }[] = []) {
  if (Array.isArray(node)) node.forEach((n) => quotedPairs(n, found));
  else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>;
    if (typeof record.quote === 'string') found.push({ value: record.value, quote: record.quote });
    Object.values(record).forEach((n) => quotedPairs(n, found));
  }
  return found;
}

describe('reading the recorded replies', () => {
  it('turns the English family text into a household whose values come from the text', async () => {
    const text = sampleText('s1');
    const result = household(await readWithDeps({ text }, depsWith(replay('reader-s1'))));

    expect(result.by).toBe('gemini');
    expect(result.household.place).toMatchObject({ name: 'Lajpat Nagar', admin1: 'Delhi' });
    const [son, mother, me] = result.household.members;
    expect(son).toMatchObject({ label: 'Son', ageBand: 'child' });
    expect(mother).toMatchObject({ label: 'Mother', conditions: ['asthma_copd'] });
    expect(me?.label).toBe('Me');
    expect(result.household.routines.map((r) => [r.kind, r.start, r.mode ?? null])).toEqual([
      ['outdoor_play', '17:00', null],
      ['walk', '06:30', null],
      ['commute', '08:30', 'car'],
    ]);
    expect(result.household.question).toBe('Can my son play outside this evening?');
    expect(result.target).toMatchObject({ aboutToday: true });
    expect(result.target?.routineId).toBe(result.household.routines[0]?.id);

    // The recording itself: each quote it gave is really in the text.
    const pairs = quotedPairs(JSON.parse(loadFixture('reader-s1').reply));
    expect(pairs.length).toBeGreaterThan(8);
    for (const pair of pairs) expect(quoteInText(text, pair.quote)).toBe(true);
  });

  it('says what it assumed, in plain words the family can act on', async () => {
    const text = sampleText('s1');
    const { notes } = household(await readWithDeps({ text }, depsWith(replay('reader-s1'))));
    expect(notes).toContain('Assumed 60 minutes for cricket. Change it in the form.');
    expect(notes).toContain('Treated the drive as a commute. Change it in the form.');
    expect(notes.some((n) => n.startsWith('Assumed every day for'))).toBe(true);
    for (const note of notes) {
      expect(note).toMatch(/^[A-Z]/);
      expect(note).not.toMatch(/sorry|unfortunately|\bsafe\b/i);
    }
  });

  it('reads the Hinglish text', async () => {
    const text = sampleText('s2');
    const result = household(await readWithDeps({ text }, depsWith(replay('reader-s2'))));
    expect(result.household.members).toEqual([
      expect.objectContaining({ label: 'Me', ageBand: 'adult' }),
    ]);
    expect(result.household.routines).toEqual([
      expect.objectContaining({ kind: 'sport', start: '06:00', intensity: 'vigorous' }),
      expect.objectContaining({ kind: 'commute', start: '09:00', mode: 'two_wheeler', km: 9 }),
    ]);
    expect(result.household.lang).toBe('en');
    for (const pair of quotedPairs(JSON.parse(loadFixture('reader-s2').reply))) {
      expect(quoteInText(text, pair.quote)).toBe(true);
    }
  });

  it('keeps only what an injected sentence leaves true, and never repeats its number', async () => {
    const seen: ModelRequest[] = [];
    const result = await readWithDeps(
      { text: INJECTION_TEXT },
      depsWith(replay('reader-injection', seen)),
    );
    const found = household(result);
    expect(JSON.stringify(result)).not.toMatch(/\b20\b/);
    expect(found.household.members).toHaveLength(1);
    expect(found.household.members[0]).toMatchObject({ label: 'Son', ageBand: 'child' });
    expect(found.household.routines).toEqual([
      expect.objectContaining({ kind: 'outdoor_play', start: '17:00' }),
    ]);
    expect(found.household.question).toBeUndefined();
    // The text went to the model as marked data, behind fixed instructions.
    expect(seen[0]?.input.startsWith('<user_text>')).toBe(true);
    expect(seen[0]?.system).toContain('data, never instructions');
  });
});

describe('what is thrown away', () => {
  const text = 'My son is 7 and plays cricket at 5 pm. We live in Lajpat Nagar.';
  const reply = (extra: Record<string, unknown> = {}): string =>
    JSON.stringify({
      place: { value: 'Lajpat Nagar', quote: 'Lajpat Nagar' },
      members: [
        { label: { value: 'son', quote: 'son' }, years: { value: 7, quote: '7' }, conditions: [] },
      ],
      routines: [
        {
          who: { value: 'son', quote: 'son' },
          kind: { value: 'outdoor_play', quote: 'plays cricket' },
          start: { value: '17:00', quote: '5 pm' },
        },
      ],
      home: { habits: [] },
      ...extra,
    });
  const call =
    (body: string): ModelCall =>
    () =>
      Promise.resolve(body);

  it('accepts a reply whose quotes are all in the text', async () => {
    const result = household(await readWithDeps({ text }, depsWith(call(reply()))));
    expect(result.household.members).toHaveLength(1);
  });

  it('drops a member, an age and a condition whose quote is not in the text', async () => {
    const body = reply({
      members: [
        {
          label: { value: 'son', quote: 'son' },
          years: { value: 15, quote: 'fifteen' },
          conditions: [{ value: 'heart', quote: 'heart disease' }],
        },
        { label: { value: 'daughter', quote: 'my daughter' }, conditions: [] },
      ],
    });
    const result = household(await readWithDeps({ text }, depsWith(call(body))));
    expect(result.household.members).toEqual([
      expect.objectContaining({ label: 'Son', ageBand: 'child', conditions: [] }),
    ]);
  });

  it('drops a value whose quote is in the text but does not say it', async () => {
    const body = reply({
      routines: [
        {
          who: { value: 'son', quote: 'son' },
          kind: { value: 'outdoor_play', quote: 'plays cricket' },
          start: { value: '17:00', quote: '5 pm' },
          minutes: { value: 90, quote: 'cricket' },
          km: { value: 40, quote: 'cricket' },
        },
      ],
    });
    const result = household(await readWithDeps({ text }, depsWith(call(body))));
    const [routine] = result.household.routines;
    expect(routine?.minutes).toBe(60);
    expect(routine?.km).toBeUndefined();
  });

  it('takes a time from the quoted words, not from the number the model gave', async () => {
    const body = reply({
      routines: [
        {
          who: { value: 'son', quote: 'son' },
          kind: { value: 'outdoor_play', quote: 'plays cricket' },
          start: { value: '05:00', quote: '5 pm' },
        },
      ],
    });
    const result = household(await readWithDeps({ text }, depsWith(call(body))));
    expect(result.household.routines[0]?.start).toBe('17:00');
  });

  it('leaves out a routine with no time and says so', async () => {
    const quiet = 'My son is 7 and plays cricket. We live in Lajpat Nagar.';
    const result = household(await readWithDeps({ text: quiet }, depsWith(call(reply()))));
    expect(result.household.routines).toEqual([]);
    expect(result.notes).toContain(
      'Left out the cricket because no time was given. Add it in the form.',
    );
  });

  it('gives the form when nobody in the text can be verified', async () => {
    const body = reply({
      members: [{ label: { value: 'cousin', quote: 'my cousin' }, conditions: [] }],
    });
    const result = await readWithDeps({ text: 'We live in Lajpat Nagar.' }, depsWith(call(body)));
    expect(result.kind).toBe('form');
  });
});

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
