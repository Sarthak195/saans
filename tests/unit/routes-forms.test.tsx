import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as askPost } from '@/app/ask/route';
import HouseholdPage from '@/app/household/page';
import { POST as savePost } from '@/app/household/save/route';
import PlanTokenPage from '@/app/plan/[token]/page';
import { sampleById } from '@/core/profile/samples';
import { readHousehold } from '@/server/genai';
import { issueFormToken } from '@/server/guards';
import { openDraft, openHousehold, sealDraft } from '@/server/seal';

import { ORIGIN, formPost, locationOf, stubKeys } from '../helpers/form';

vi.mock('@/server/genai', () => ({
  readHousehold: vi.fn(),
  readQuestion: vi.fn(),
  writeBriefing: vi.fn((input: { lang: string }) =>
    Promise.resolve({ by: 'template', lang: input.lang, text: 'A short summary.' }),
  ),
  writeNotice: vi.fn(),
}));

beforeAll(stubKeys);
beforeEach(() => {
  // No live data: a sample place falls back to its recording.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});

const FAMILY: [string, string][] = [
  ['place', 'Lajpat Nagar'],
  ['lang', 'en'],
  ['cooking', 'lpg_png'],
  ['heating', 'none'],
  ['m1_label', 'Son'],
  ['m1_age', 'child'],
  ['r1_kind', 'outdoor_play'],
  ['r1_member', 'm1'],
  ['r1_start', '17:00'],
  ['r1_minutes', '60'],
  ['r1_intensity', 'vigorous'],
  ['r1_days', 'mon,tue,wed'],
  ['r1_flex', '2'],
];

function pathOf(location: string): string {
  return location.split('?')[0]?.split('#')[0] ?? '';
}

describe('the household form without JavaScript', () => {
  it('turns a filled form into a redirect to a plan that opens', async () => {
    const response = await savePost(formPost('/household/save', FAMILY));
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location).toMatch(/^\/plan\/[A-Za-z0-9_-]+\?status=made#plan-title$/);

    const token = pathOf(location).replace('/plan/', '');
    const household = openHousehold(token);
    expect(household.place.name).toBe('Lajpat Nagar');
    expect(household.members[0]?.label).toBe('Son');
    expect(household.routines[0]).toMatchObject({ start: '17:00', minutes: 60, flexHours: 2 });

    const page = await PlanTokenPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({ status: 'made' }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('Plan for ');
    expect(html).toContain('Son');
    expect(html).toContain('Written by Saans from your plan');
    expect(html).toContain('This link contains your family&#x27;s profile.');
  });

  it('sends a form with mistakes back with every value kept and a reason for each mistake', async () => {
    const broken = FAMILY.filter(([name]) => name !== 'r1_start').map(([n, v]): [string, string] =>
      n === 'm1_age' ? [n, ''] : [n, v],
    );
    const response = await savePost(formPost('/household/save', broken));
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location).toContain('#error-summary');

    const draft = openDraft(new URL(location, ORIGIN).searchParams.get('draft') ?? '');
    expect(draft.errors?.map((e) => e.field)).toEqual(
      expect.arrayContaining(['m1_age', 'r1_start']),
    );
    expect(draft.values).toMatchObject({ place: 'Lajpat Nagar', m1_label: 'Son' });

    const page = await HouseholdPage({
      searchParams: Promise.resolve({
        draft: new URL(location, ORIGIN).searchParams.get('draft') ?? '',
      }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="#f-r1_start"');
    expect(html).toContain('value="Son"');
  });

  it('asks for a place when none is typed', async () => {
    const without = FAMILY.filter(([name]) => name !== 'place');
    const location = locationOf(await savePost(formPost('/household/save', without)));
    const draft = openDraft(new URL(location, ORIGIN).searchParams.get('draft') ?? '');
    expect(draft.errors?.[0]?.field).toBe('place');
  });
});

describe('guards on form posts', () => {
  it('refuses a post from another site with 403', async () => {
    const response = await savePost(
      formPost('/household/save', FAMILY, { origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('did not come from this page');
  });

  it('refuses a post with no origin and no same-origin signal with 403', async () => {
    const response = await savePost(formPost('/household/save', FAMILY, { origin: null }));
    expect(response.status).toBe(403);
  });

  it('refuses an oversize body with 413', async () => {
    const response = await savePost(
      formPost('/household/save', { ...Object.fromEntries(FAMILY), padding: 'x'.repeat(20_000) }),
    );
    expect(response.status).toBe(413);
  });

  it('refuses an old form token and offers to start again', async () => {
    const old = issueFormToken(new Date(Date.now() - 31 * 60_000));
    const response = await savePost(formPost('/household/save', FAMILY, { token: old }));
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Start again');
    expect(html).toContain('href="/household"');
  });

  it('refuses a made-up form token', async () => {
    const response = await savePost(formPost('/household/save', FAMILY, { token: '1.abc' }));
    expect(response.status).toBe(400);
  });

  it('refuses a body that is not a urlencoded form', async () => {
    const request = new Request(`${ORIGIN}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: '{}',
    });
    expect((await askPost(request)).status).toBe(413);
  });
});

describe('POST /ask', () => {
  const household = sampleById('s1')?.household;
  if (household === undefined) throw new Error('no sample');

  it('seals a read household and lands on the answer when the question named a routine', async () => {
    vi.mocked(readHousehold).mockResolvedValue({
      kind: 'household',
      household,
      target: { routineId: 'play', aboutToday: true },
      notes: ['Assumed: age band child.'],
      by: 'keywords',
    });
    const response = await askPost(formPost('/ask', { text: 'We live in Delhi.', place: '' }));
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location).toMatch(/#answer$/);
    const token = pathOf(location).replace('/plan/', '');
    expect(openHousehold(token).questionTarget).toEqual({ routineId: 'play', aboutToday: true });
    // Only a fixed key travels in the address, never the wording the reader produced.
    expect(new URL(location, ORIGIN).searchParams.get('note')).toBe('filled');
    expect(location).not.toContain('Assumed');
  });

  it('uses its own note when the text was read by matching words', async () => {
    vi.mocked(readHousehold).mockResolvedValue({
      kind: 'household',
      household,
      notes: ['We read this by matching words, without the AI reader. Please check each detail.'],
      by: 'keywords',
    });
    const location = locationOf(await askPost(formPost('/ask', { text: 'We live in Delhi.' })));
    expect(new URL(location, ORIGIN).searchParams.get('note')).toBe('keywords');
    expect(location).not.toContain('matching');
  });

  it('lists the places when the text names a place that exists in several states', async () => {
    vi.mocked(readHousehold).mockResolvedValue({
      kind: 'choose_place',
      text: 'We live in Rampur.',
      options: [
        { name: 'Rampur', admin1: 'Uttar Pradesh', lat: 28.8, lon: 79.03, source: 'geocoder' },
        { name: 'Rampur', admin1: 'Himachal Pradesh', lat: 31.45, lon: 77.63, source: 'geocoder' },
      ],
    });
    const location = locationOf(await askPost(formPost('/ask', { text: 'We live in Rampur.' })));
    expect(location).toMatch(/^\/choose\/[A-Za-z0-9_-]+$/);
    const draft = openDraft(location.replace('/choose/', ''));
    expect(draft.options).toHaveLength(2);
    expect(draft.text).toBe('We live in Rampur.');
  });

  it('opens the form with the text and the reason when the text cannot be read', async () => {
    vi.mocked(readHousehold).mockResolvedValue({
      kind: 'form',
      reason: 'Reading text is not available.',
      text: 'Some words',
    });
    const location = locationOf(await askPost(formPost('/ask', { text: 'Some words' })));
    expect(pathOf(location)).toBe('/household');
    const draft = openDraft(new URL(location, ORIGIN).searchParams.get('draft') ?? '');
    expect(draft).toMatchObject({ text: 'Some words', reason: 'Reading text is not available.' });
  });

  it('sends empty text to the form with a reason, without calling the reader', async () => {
    vi.mocked(readHousehold).mockClear();
    const location = locationOf(await askPost(formPost('/ask', { text: '   ' })));
    expect(pathOf(location)).toBe('/household');
    expect(readHousehold).not.toHaveBeenCalled();
  });

  it('accepts a long Hindi text within the cap', async () => {
    vi.mocked(readHousehold).mockResolvedValue({ kind: 'form', reason: 'x', text: 'y' });
    const text = 'मेरा बेटा रोज़ शाम को खेलता है। '.repeat(45).slice(0, 1500);
    const response = await askPost(formPost('/ask', { text }));
    expect(response.status).toBe(303);
  });

  it('takes a picked place from the sealed list and not from fields the client sets', async () => {
    vi.mocked(readHousehold).mockResolvedValue({ kind: 'form', reason: 'x', text: 'Hello' });
    const list = sealDraft({
      text: 'Hello',
      options: [
        { name: 'Rampur', admin1: 'Uttar Pradesh', lat: 28.8, lon: 79 },
        { name: 'Rampur', admin1: 'Himachal Pradesh', lat: 31.5, lon: 77.6 },
      ],
    });
    await askPost(
      formPost('/ask', {
        text: 'Hello',
        draft: list,
        option: '1',
        placeName: 'Safe air zone, no masks needed',
        placeAdmin1: 'Delhi',
        placeLat: '28.6',
        placeLon: '77.2',
      }),
    );
    expect(vi.mocked(readHousehold).mock.calls.at(-1)?.[0].place).toEqual({
      name: 'Rampur',
      admin1: 'Himachal Pradesh',
      lat: 31.5,
      lon: 77.6,
      source: 'geocoder',
    });

    vi.mocked(readHousehold).mockClear();
    const refused = await askPost(formPost('/ask', { text: 'Hello', draft: list, option: '2' }));
    expect(refused.status).toBe(400);
    expect(readHousehold).not.toHaveBeenCalled();
  });

  it('says Saans covers India for a location outside it, and uses the nearest listed place inside it', async () => {
    const outside = locationOf(
      await askPost(formPost('/ask', { text: 'Hello', lat: '51.5', lon: '-0.1' })),
    );
    const reason = openDraft(new URL(outside, ORIGIN).searchParams.get('draft') ?? '').reason;
    expect(reason).toContain('Saans covers India');

    vi.mocked(readHousehold).mockResolvedValue({ kind: 'form', reason: 'x', text: 'Hello' });
    await askPost(formPost('/ask', { text: 'Hello', lat: '28.6', lon: '77.2' }));
    expect(vi.mocked(readHousehold).mock.calls.at(-1)?.[0].place?.name).toBeDefined();
  });
});
