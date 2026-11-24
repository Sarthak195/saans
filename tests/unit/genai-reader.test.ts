import { afterEach, describe, expect, it, vi } from 'vitest';

import { quoteInText } from '@/core/text';
import type { ModelCall, ModelRequest } from '@/server/genai/model';
import { readWithDeps } from '@/server/genai/reader';
import type { ReaderResult } from '@/server/genai/types';

import {
  FATHER_TEXT,
  INJECTION_TEXT,
  depsWith,
  loadFixture,
  replay,
  sampleText,
} from '../helpers/genai';

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

  it('keeps a stated age and a walk the text writes as "walks"', async () => {
    const result = household(
      await readWithDeps({ text: FATHER_TEXT }, depsWith(replay('reader-father'))),
    );
    expect(result.household.members).toEqual([
      expect.objectContaining({ label: 'Father', ageBand: 'older' }),
    ]);
    expect(result.household.routines).toEqual([
      expect.objectContaining({ kind: 'walk', start: '06:00' }),
    ]);
    expect(result.notes.join(' ')).not.toContain('Assumed an adult');
    for (const pair of quotedPairs(JSON.parse(loadFixture('reader-father').reply))) {
      expect(typeof pair.quote).toBe('string');
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
