import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CommunityTokenPage from '@/app/plan/[token]/community/page';
import { POST as askPost } from '@/app/plan/[token]/ask/route';
import { POST as placePost } from '@/app/plan/[token]/place/route';
import { POST as whatIfPost } from '@/app/plan/[token]/whatif/route';
import CommunitySamplePage from '@/app/plan/sample/[id]/community/page';
import SamplePage from '@/app/plan/sample/[id]/page';
import { whatsappLink } from '@/components/community-view';
import { noteLine } from '@/components/copy';
import { sampleById } from '@/core/profile/samples';
import { readQuestion, writeNotice } from '@/server/genai';
import { loadPlanView } from '@/server/plan-view';
import { openDraft, openHousehold, sealDraft, sealHousehold } from '@/server/seal';
import { sealWritten } from '@/server/written-draft';

import { ORIGIN, formPost, locationOf, stubKeys } from '../helpers/form';
import { DASHES } from '../helpers/plan';
import { writtenFor } from '../helpers/written';
import { recorded, replyWith } from '../helpers/geocode';

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
let TOKEN = '';
beforeAll(() => {
  stubKeys();
  TOKEN = sealHousehold(sample.household);
});
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});

const context = (token: string): { params: Promise<{ token: string }> } => ({
  params: Promise.resolve({ token }),
});

function query(location: string): URLSearchParams {
  return new URL(location, ORIGIN).searchParams;
}
function tokenOf(location: string): string {
  return location.split('?')[0]?.split('#')[0]?.replace('/plan/', '') ?? '';
}

describe('POST /plan/[token]/whatif', () => {
  it('moves one routine, keeps the others, and links back to the old plan for a before and after line', async () => {
    const response = await whatIfPost(
      formPost('/plan/x/whatif', {
        routineId: 'play',
        change: 'time',
        newStart: '14:00',
        newMode: '',
        day: 'today',
      }),
      context(TOKEN),
    );
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location).toMatch(/#routine-play$/);
    expect(query(location).get('from')).toBe(TOKEN);
    expect(query(location).get('r')).toBe('play');
    expect(query(location).get('day')).toBe('today');

    const changed = openHousehold(tokenOf(location));
    const before = sample.household.routines;
    expect(changed.routines.find((r) => r.id === 'play')?.start).toBe('14:00');
    expect(changed.routines.filter((r) => r.id !== 'play')).toEqual(
      before.filter((r) => r.id !== 'play'),
    );
  });

  it('changes the mode when asked for a mode', async () => {
    const response = await whatIfPost(
      formPost('/plan/x/whatif', {
        routineId: 'drive',
        change: 'mode',
        newStart: '',
        newMode: 'metro_rail',
      }),
      context(TOKEN),
    );
    const changed = openHousehold(tokenOf(locationOf(response)));
    expect(changed.routines.find((r) => r.id === 'drive')?.mode).toBe('metro_rail');
  });

  it('leaves the plan alone for an unknown routine or a bad time', async () => {
    const unknown = await whatIfPost(
      formPost('/plan/x/whatif', { routineId: 'nope', change: 'time', newStart: '14:00' }),
      context(TOKEN),
    );
    expect(locationOf(unknown).startsWith(`/plan/${TOKEN}`)).toBe(true);

    const bad = await whatIfPost(
      formPost('/plan/x/whatif', { routineId: 'play', change: 'time', newStart: '25:99' }),
      context(TOKEN),
    );
    const same = openHousehold(tokenOf(locationOf(bad)));
    expect(same.routines.find((r) => r.id === 'play')?.start).toBe('17:00');
  });

  it('shows a friendly page for a tampered plan token', async () => {
    const tampered = `${TOKEN.slice(0, -4)}AAAA`;
    const response = await whatIfPost(
      formPost('/plan/x/whatif', { routineId: 'play', change: 'time', newStart: '14:00' }),
      context(tampered),
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('This link is not valid');
    expect(html).toContain('href="/"');
  });

  it('refuses a cross-origin post before looking at the token', async () => {
    const response = await whatIfPost(
      formPost('/plan/x/whatif', { routineId: 'play' }, { origin: 'https://evil.example' }),
      context('not-a-token'),
    );
    expect(response.status).toBe(403);
  });
});

describe('POST /plan/[token]/place', () => {
  it('plans the same household in a listed place', async () => {
    const response = await placePost(
      formPost('/plan/x/place', { place: 'Mumbai' }),
      context(TOKEN),
    );
    const location = locationOf(response);
    expect(query(location).get('status')).toBe('place');
    const moved = openHousehold(tokenOf(location));
    expect(moved.place.name).toBe('Mumbai');
    expect(moved.members).toEqual(sample.household.members);
    expect(moved.routines).toEqual(sample.household.routines);
  });

  it('asks which one when a name belongs to several states, and posts the pick back here', async () => {
    replyWith(recorded('rampur'));
    const location = locationOf(
      await placePost(formPost('/plan/x/place', { place: 'Rampur' }), context(TOKEN)),
    );
    expect(location).toMatch(/^\/choose\/[A-Za-z0-9_-]+\?for=/);
    expect(query(location).get('for')).toBe(TOKEN);
    const draft = openDraft(location.split('?')[0]?.replace('/choose/', '') ?? '');
    expect(draft.options.length).toBeGreaterThan(1);

    const pick = draft.options[1];
    if (pick === undefined) throw new Error('no option');
    const chosen = await placePost(
      formPost('/plan/x/place', {
        draft: location.split('?')[0]?.replace('/choose/', '') ?? '',
        option: '1',
      }),
      context(TOKEN),
    );
    expect(openHousehold(tokenOf(locationOf(chosen))).place).toEqual(pick);
  });

  it('takes a picked place from the sealed list and never from fields a client could set', async () => {
    const list = sealDraft({
      text: '',
      options: [{ name: 'Rampur', admin1: 'Himachal Pradesh', lat: 31.5, lon: 77.6 }],
    });
    const forged = {
      placeName: 'Safe air zone, no masks needed',
      placeAdmin1: 'Delhi',
      placeLat: '28.6',
      placeLon: '77.2',
    };
    // The old four fields mean nothing now: with no list, no typed place and no device
    // location, the plan stays as it was and the family is asked for a place.
    replyWith({ results: [] });
    const ignored = locationOf(await placePost(formPost('/plan/x/place', forged), context(TOKEN)));
    expect(tokenOf(ignored)).toBe(TOKEN);
    expect(query(ignored).get('note')).toBe('placeMissing');

    const chosen = locationOf(
      await placePost(
        formPost('/plan/x/place', { ...forged, draft: list, option: '0' }),
        context(TOKEN),
      ),
    );
    expect(openHousehold(tokenOf(chosen)).place.name).toBe('Rampur');
    for (const option of ['1', '-1', 'x', '']) {
      const refused = await placePost(
        formPost('/plan/x/place', { draft: list, option }),
        context(TOKEN),
      );
      expect(refused.status).toBe(400);
    }
    const notAList = await placePost(
      formPost('/plan/x/place', { draft: 'abc', option: '0' }),
      context(TOKEN),
    );
    expect(notAList.status).toBe(400);
  });

  it('says so when no place matches, and keeps the plan', async () => {
    replyWith({ results: [] });
    const location = locationOf(
      await placePost(formPost('/plan/x/place', { place: 'Qwertyland' }), context(TOKEN)),
    );
    expect(tokenOf(location)).toBe(TOKEN);
    expect(query(location).get('note')).toBe('placeNotFound');
    expect(noteLine('placeNotFound')).toContain('Nothing in India matched');
  });

  it('lands on the place box, which the plan shows open with the reason beside it', async () => {
    const location = locationOf(await placePost(formPost('/plan/x/place', {}), context(TOKEN)));
    expect(location.endsWith('#place-change')).toBe(true);
    expect(query(location).get('note')).toBe('placeMissing');

    const page = await SamplePage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({ note: 'placeMissing' }),
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('<details class="change-place" open="">');
    expect(html).toContain('<p id="place-change-error" class="field-error">Type a place in India');
    expect(html).toMatch(/<input id="place-change"[^>]*aria-invalid="true"/);
    // Any other note leaves the panel closed.
    const other = renderToStaticMarkup(
      await SamplePage({
        params: Promise.resolve({ id: 's1' }),
        searchParams: Promise.resolve({ note: 'keywords' }),
      }),
    );
    expect(other).toContain('<details class="change-place">');
  });

  it('moves the plan to the device location, named after the nearest listed place', async () => {
    const location = locationOf(
      await placePost(formPost('/plan/x/place', { lat: '19.1', lon: '72.9' }), context(TOKEN)),
    );
    expect(query(location).get('status')).toBe('place');
    const moved = openHousehold(tokenOf(location));
    expect(moved.place).toMatchObject({ name: 'Mumbai', admin1: 'Maharashtra' });
    expect(moved.members).toEqual(sample.household.members);
  });

  it('keeps an unnamed device location as "Your location" with its rounded coordinates', async () => {
    const location = locationOf(
      await placePost(formPost('/plan/x/place', { lat: '12.3', lon: '76.6' }), context(TOKEN)),
    );
    expect(openHousehold(tokenOf(location)).place).toEqual({
      name: 'Your location',
      admin1: 'India',
      lat: 12.3,
      lon: 76.6,
    });
  });

  it('lets a typed place win over the device location', async () => {
    const location = locationOf(
      await placePost(
        formPost('/plan/x/place', { place: 'Pune', lat: '19.1', lon: '72.9' }),
        context(TOKEN),
      ),
    );
    expect(openHousehold(tokenOf(location)).place.name).toBe('Pune');
  });

  it('keeps the plan and says why for a location outside India or a place search that is down', async () => {
    const outside = locationOf(
      await placePost(formPost('/plan/x/place', { lat: '51.5', lon: '-0.1' }), context(TOKEN)),
    );
    expect(tokenOf(outside)).toBe(TOKEN);
    expect(query(outside).get('note')).toBe('placeOutside');
    expect(noteLine('placeOutside')).toContain('India only');

    // The default stub answers 503, so a name that is not listed cannot be looked up.
    const down = locationOf(
      await placePost(formPost('/plan/x/place', { place: 'Mysuru' }), context(TOKEN)),
    );
    expect(tokenOf(down)).toBe(TOKEN);
    expect(query(down).get('note')).toBe('placeLookup');
    expect(noteLine('placeLookup')).toContain('could not look up');
  });
});

describe('POST /plan/[token]/ask', () => {
  it('re-plans a what-if question and links back to the old plan', async () => {
    vi.mocked(readQuestion).mockResolvedValue({
      kind: 'question',
      intent: 'what_if_time',
      target: { routineId: 'play', hour: 15 },
      newStart: '15:00',
    });
    const location = locationOf(
      await askPost(formPost('/plan/x/ask', { text: 'What if he plays at 3 pm?' }), context(TOKEN)),
    );
    const changed = openHousehold(tokenOf(location));
    expect(changed.routines.find((r) => r.id === 'play')?.start).toBe('15:00');
    expect(changed.questionTarget).toEqual({ routineId: 'play', hour: 15 });
    expect(changed.question).toBe('What if he plays at 3 pm?');
    expect(query(location).get('from')).toBe(TOKEN);
    expect(location).toMatch(/#answer$/);
  });

  it('sets the question target for a can-I question without changing any routine', async () => {
    vi.mocked(readQuestion).mockResolvedValue({
      kind: 'question',
      intent: 'can_i',
      target: { routineId: 'walk' },
    });
    const location = locationOf(
      await askPost(formPost('/plan/x/ask', { text: 'Can she walk?' }), context(TOKEN)),
    );
    const asked = openHousehold(tokenOf(location));
    expect(asked.questionTarget).toEqual({ routineId: 'walk' });
    expect(asked.routines).toEqual(sample.household.routines);
  });

  it('shows the reason when the question is unclear', async () => {
    vi.mocked(readQuestion).mockResolvedValue({
      kind: 'unclear',
      reason: 'Which routine do you mean?',
    });
    const location = locationOf(
      await askPost(formPost('/plan/x/ask', { text: 'hmm' }), context(TOKEN)),
    );
    expect(tokenOf(location)).toBe(TOKEN);
    expect(query(location).get('note')).toBe('notUnderstood');
    expect(noteLine('notUnderstood')).toContain('which routine you mean');
  });
});

describe('plan pages and the community notice', () => {
  const NOTICE = 'Please keep outdoor play indoors today. Air is poor.';

  function hrefsOf(html: string): string[] {
    return [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? '').replaceAll('&amp;', '&'));
  }

  const school = sampleById('s6');
  if (school === undefined) throw new Error('no sample');

  const sealedNotice = async (token: string): Promise<string> =>
    sealWritten(
      { by: 'gemini', lang: 'en', text: NOTICE },
      await writtenFor(school.household, token, {
        audience: school.household.community?.kind ?? 'society',
      }),
    );

  it('builds a WhatsApp link that carries only the notice', async () => {
    const schoolToken = sealHousehold(school.household);
    const n = await sealedNotice(schoolToken);
    const onToken = renderToStaticMarkup(
      await CommunityTokenPage({
        params: Promise.resolve({ token: schoolToken }),
        searchParams: Promise.resolve({ n }),
      }),
    );
    const links = hrefsOf(onToken).filter((h) => h.startsWith('https://wa.me/'));
    expect(links).toEqual([whatsappLink(NOTICE)]);
    const link = links[0] ?? '';
    expect(link).not.toContain(schoolToken);
    expect(link).not.toContain('/plan/');
    expect(decodeURIComponent(link.split('text=')[1] ?? '')).toBe(NOTICE);
    expect(onToken).toContain('Copy the notice');
    expect(onToken).toContain('Written by Gemini from your plan');
    expect(onToken).not.toContain('Write it with Gemini');
  });

  it('does not show a notice sealed for another link, on a sample or on a different plan', async () => {
    const n = await sealedNotice(sealHousehold(school.household));
    // A sample page seals its household afresh on every view, so a notice made elsewhere is not for it.
    const onSample = renderToStaticMarkup(
      await CommunitySamplePage({
        params: Promise.resolve({ id: 's6' }),
        searchParams: Promise.resolve({ n }),
      }),
    );
    const other = renderToStaticMarkup(
      await CommunityTokenPage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({ n }),
      }),
    );
    for (const html of [onSample, other]) {
      expect(html).not.toContain(NOTICE);
      expect(html).toContain('Written by Saans from your plan');
    }
  });

  it('shows the code-built notice and offers Gemini, without calling the writer', async () => {
    vi.mocked(writeNotice).mockClear();
    const html = renderToStaticMarkup(
      await CommunityTokenPage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain('Written by Saans from your plan');
    expect(html).toContain('Write it with Gemini');
    expect(html).toContain(`action="/plan/${TOKEN}/community/notice"`);
    expect(writeNotice).not.toHaveBeenCalled();
  });

  it('ignores the old notice trigger and a tampered notice parameter', async () => {
    vi.mocked(writeNotice).mockClear();
    const n = await sealedNotice(TOKEN);
    for (const searchParams of [{ notice: '1' }, { n: `${n.slice(0, -4)}AAAA` }]) {
      const html = renderToStaticMarkup(
        await CommunityTokenPage({
          params: Promise.resolve({ token: TOKEN }),
          searchParams: Promise.resolve(searchParams),
        }),
      );
      expect(html).toContain('Written by Saans from your plan');
      expect(html).not.toContain(NOTICE);
    }
    expect(writeNotice).not.toHaveBeenCalled();
  });

  it('renders a sample page with the recorded smog day label and no dead day links', async () => {
    const html = renderToStaticMarkup(
      await SamplePage({
        params: Promise.resolve({ id: 's1' }),
        searchParams: Promise.resolve({ air: 'smog-day' }),
      }),
    );
    expect(html).toContain(
      'Recorded smog day: Delhi, 13 Dec 2025 (GRAP Stage IV was in force). Not live.',
    );
    expect(html).not.toContain('>Day after<');
    expect(html).toContain('Read it with Gemini');
    expect(html).not.toMatch(DASHES);
  });
});

describe('loadPlanView with no air data', () => {
  it('still builds the plan and the home advice for a place with no recording', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('slow', 'TimeoutError')));
    const jaipur = {
      ...sample.household,
      place: { name: 'Jaipur', admin1: 'Rajasthan', lat: 26.9, lon: 75.8 },
    };
    const view = await loadPlanView({
      household: jaipur,
      now: new Date('2026-11-21T10:00:00+05:30'),
    });
    expect(view.unavailable).toBe('upstream_unavailable');
    expect(view.plan.air.aqi.kind).toBe('insufficient');
    expect(view.plan.routines.length).toBeGreaterThan(0);
    expect(view.home.length).toBeGreaterThan(0);
  });
});
