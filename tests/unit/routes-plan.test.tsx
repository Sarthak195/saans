import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CommunityTokenPage from '@/app/plan/[token]/community/page';
import { POST as askPost } from '@/app/plan/[token]/ask/route';
import { POST as placePost } from '@/app/plan/[token]/place/route';
import { POST as whatIfPost } from '@/app/plan/[token]/whatif/route';
import CommunitySamplePage from '@/app/plan/sample/[id]/community/page';
import SamplePage from '@/app/plan/sample/[id]/page';
import { whatsappLink } from '@/components/community-view';
import { sampleById } from '@/core/profile/samples';
import { readQuestion, writeNotice } from '@/server/genai';
import { loadPlanView } from '@/server/plan-view';
import { openDraft, openHousehold, sealHousehold } from '@/server/seal';

import { ORIGIN, formPost, locationOf, stubKeys } from '../helpers/form';
import { DASHES } from '../helpers/plan';
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

    const pick = draft.options[0];
    if (pick === undefined) throw new Error('no option');
    const chosen = await placePost(
      formPost('/plan/x/place', {
        placeName: pick.name,
        placeAdmin1: pick.admin1,
        placeLat: String(pick.lat),
        placeLon: String(pick.lon),
      }),
      context(TOKEN),
    );
    expect(openHousehold(tokenOf(locationOf(chosen))).place).toEqual(pick);
  });

  it('says so when no place matches, and keeps the plan', async () => {
    replyWith({ results: [] });
    const location = locationOf(
      await placePost(formPost('/plan/x/place', { place: 'Qwertyland' }), context(TOKEN)),
    );
    expect(tokenOf(location)).toBe(TOKEN);
    expect(openDraft(query(location).get('note') ?? '').reason).toContain(
      'Nothing in India matched',
    );
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
    expect(openDraft(query(location).get('note') ?? '').reason).toBe('Which routine do you mean?');
  });
});

describe('plan pages and the community notice', () => {
  const NOTICE = 'Please keep outdoor play indoors today. Air is poor.';

  beforeEach(() => {
    vi.mocked(writeNotice).mockResolvedValue({ by: 'template', lang: 'en', text: NOTICE });
  });

  function hrefsOf(html: string): string[] {
    return [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? '').replaceAll('&amp;', '&'));
  }

  it('builds a WhatsApp link that carries only the notice, on a sample and on a shared link', async () => {
    const onSample = renderToStaticMarkup(
      await CommunitySamplePage({
        params: Promise.resolve({ id: 's6' }),
        searchParams: Promise.resolve({ notice: '1' }),
      }),
    );
    const school = sampleById('s6');
    if (school === undefined) throw new Error('no sample');
    const schoolToken = sealHousehold(school.household);
    const onToken = renderToStaticMarkup(
      await CommunityTokenPage({
        params: Promise.resolve({ token: schoolToken }),
        searchParams: Promise.resolve({ notice: '1' }),
      }),
    );

    for (const [html, token] of [
      [onSample, schoolToken],
      [onToken, schoolToken],
    ] as const) {
      const links = hrefsOf(html).filter((h) => h.startsWith('https://wa.me/'));
      expect(links).toEqual([whatsappLink(NOTICE)]);
      const link = links[0] ?? '';
      expect(link).not.toContain(token);
      expect(link).not.toContain('/plan/');
      expect(decodeURIComponent(link.split('text=')[1] ?? '')).toBe(NOTICE);
    }
    expect(onToken).toContain('Copy the notice');
  });

  it('offers to write the notice before it is written, without calling the writer', async () => {
    vi.mocked(writeNotice).mockClear();
    const html = renderToStaticMarkup(
      await CommunityTokenPage({
        params: Promise.resolve({ token: TOKEN }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain('Write a notice for my building');
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
