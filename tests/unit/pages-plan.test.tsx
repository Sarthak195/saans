import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import PlanTokenPage from '@/app/plan/[token]/page';
import { sampleById } from '@/core/profile/samples';
import { sealDraft, sealHousehold } from '@/server/seal';

import { stubKeys } from '../helpers/form';

vi.mock('@/server/genai', () => ({
  readHousehold: vi.fn(),
  readQuestion: vi.fn(),
  writeBriefing: vi.fn((input: { lang: string }) =>
    Promise.resolve({ by: 'template', lang: input.lang, text: 'A short summary.' }),
  ),
  writeNotice: vi.fn(),
}));

const sample = sampleById('s1');
if (sample === undefined) throw new Error('no sample');

// A Saturday morning in IST, so the sample's routines all happen on the plan day.
const SATURDAY = new Date('2026-11-21T09:00:00+05:30');

beforeAll(stubKeys);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SATURDAY);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});
afterEach(() => {
  vi.useRealTimers();
});

async function render(token: string, searchParams: Record<string, string> = {}): Promise<string> {
  const page = await PlanTokenPage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({ day: 'today', ...searchParams }),
  });
  return renderToStaticMarkup(page);
}

describe('a shared plan page', () => {
  it('shows a before and after line for the routine a what-if changed', async () => {
    const before = sealHousehold(sample.household);
    const moved = {
      ...sample.household,
      routines: sample.household.routines.map((r) =>
        r.id === 'play' ? { ...r, start: '14:00' } : r,
      ),
    };
    const html = await render(sealHousehold(moved), { from: before, r: 'play', status: 'changed' });
    expect(html).toContain('Before your change');
    expect(html).toContain('Your change is applied.');
    expect(html).toContain('at 17:00');
    expect(html).toContain('at 14:00');
  });

  it('leaves the line out when the old link is not valid', async () => {
    const html = await render(sealHousehold(sample.household), { from: 'garbage', r: 'play' });
    expect(html).not.toContain('Before your change');
    expect(html).toContain('Timeline');
  });

  it('shows a note only from the fixed list of keys, never text from the address', async () => {
    const token = sealHousehold(sample.household);
    const known = await render(token, { note: 'noAir' });
    expect(known).toContain('There is no air data to write about right now');

    // A draft that carries words, or any other value, opens nothing on someone else's plan.
    const words = 'Outdoor time is safe for everyone today';
    const draft = sealDraft({ text: '', options: [], reason: words });
    for (const note of [draft, words, 'constructor', '__proto__', 'toString']) {
      const html = await render(token, { note });
      expect(html).not.toContain(words);
      expect(html).not.toContain('There is no air data to write about');
    }
  });

  it('shows a friendly notice for a tampered link', async () => {
    const token = sealHousehold(sample.household);
    const html = await render(`${token.slice(0, -4)}AAAA`);
    expect(html).toContain('This link is not valid');
    expect(html).toContain('href="/household"');
  });

  it('gives no advice and no go-ahead when there is no air data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('slow', 'TimeoutError')));
    const jaipur = {
      ...sample.household,
      place: { name: 'Jaipur', admin1: 'Rajasthan', lat: 26.9, lon: 75.8 },
    };
    const html = await render(sealHousehold(jaipur));
    expect(html).toContain('role="alert"');
    expect(html).toContain('No air data, so there is no advice');
    expect(html).not.toContain('Keep it');
    expect(html).not.toContain('Open windows as you usually do');
    expect(html).not.toContain('ribbon');
    expect(html).not.toContain('The day at a glance');
  });

  it('does not call a plan for another day "today"', async () => {
    const html = await render(sealHousehold(sample.household), { day: 'tomorrow' });
    expect(html).not.toContain('Today at a glance');
    expect(html).not.toContain('very bad today');
  });
});
