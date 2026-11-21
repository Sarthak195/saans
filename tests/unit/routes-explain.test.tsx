import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as noticePost } from '@/app/plan/[token]/community/notice/route';
import CommunityTokenPage from '@/app/plan/[token]/community/page';
import { POST as explainPost } from '@/app/plan/[token]/explain/route';
import PlanTokenPage from '@/app/plan/[token]/page';
import CommunitySamplePage from '@/app/plan/sample/[id]/community/page';
import SamplePage from '@/app/plan/sample/[id]/page';
import { sampleById } from '@/core/profile/samples';
import { writeBriefing, writeNotice } from '@/server/genai';
import { sealHousehold } from '@/server/seal';
import { openWritten, sealWritten } from '@/server/written-draft';

import { ORIGIN, formPost, locationOf, stubKeys } from '../helpers/form';
import { DASHES } from '../helpers/plan';

vi.mock('@/server/genai', () => ({
  readHousehold: vi.fn(),
  readQuestion: vi.fn(),
  writeBriefing: vi.fn(),
  writeNotice: vi.fn(),
}));

const sample = sampleById('s1');
const school = sampleById('s6');
if (sample === undefined || school === undefined) throw new Error('no sample');
let TOKEN = '';
let SCHOOL = '';
beforeAll(() => {
  stubKeys();
  TOKEN = sealHousehold(sample.household);
  SCHOOL = sealHousehold(school.household);
});
beforeEach(() => {
  vi.mocked(writeBriefing).mockReset();
  vi.mocked(writeNotice).mockReset();
  // No live data: a sample place falls back to its recording.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});

const context = (token: string): { params: Promise<{ token: string }> } => ({
  params: Promise.resolve({ token }),
});
const query = (location: string): URLSearchParams => new URL(location, ORIGIN).searchParams;

const SUMMARY = 'Keep the evening walk short today.';

function planHtml(searchParams: Record<string, string>): Promise<string> {
  return PlanTokenPage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve(searchParams),
  }).then(renderToStaticMarkup);
}

describe('no page view calls Gemini', () => {
  it('renders plan and community pages, shared and sample, with the model untouched', async () => {
    const pages = [
      await planHtml({}),
      renderToStaticMarkup(
        await SamplePage({
          params: Promise.resolve({ id: 's1' }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(
        await CommunityTokenPage({
          params: Promise.resolve({ token: SCHOOL }),
          searchParams: Promise.resolve({}),
        }),
      ),
      renderToStaticMarkup(
        await CommunitySamplePage({
          params: Promise.resolve({ id: 's6' }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ];
    for (const html of pages) expect(html).not.toMatch(DASHES);
    expect(writeBriefing).not.toHaveBeenCalled();
    expect(writeNotice).not.toHaveBeenCalled();
  });

  it('shows the labelled code-built summary and two Gemini buttons on a plan page', async () => {
    const html = await planHtml({});
    expect(html).toContain('Written by Saans from your plan');
    expect(html).toContain('Explain my plan with Gemini');
    expect(html).toContain('Explain in Hindi with Gemini');
    expect(html).toContain(`action="/plan/${TOKEN}/explain"`);
  });
});

describe('a written summary in the address', () => {
  it('is shown with its own label', async () => {
    const b = sealWritten({ by: 'gemini', lang: 'en', text: SUMMARY }, 'plain');
    const html = await planHtml({ b });
    expect(html).toContain(SUMMARY);
    expect(html).toContain('Written by Gemini from your plan');
    expect(writeBriefing).not.toHaveBeenCalled();
  });

  it('shows the template label and the note when the model was unavailable', async () => {
    const b = sealWritten({ by: 'template', lang: 'en', text: SUMMARY, note: 'Paused.' }, 'plain');
    const html = await planHtml({ b });
    expect(html).toContain(SUMMARY);
    expect(html).toContain('Written by Saans from your plan');
    expect(html).toContain('Paused.');
  });

  it('ignores a tampered parameter', async () => {
    const b = sealWritten({ by: 'gemini', lang: 'en', text: SUMMARY }, 'plain');
    const html = await planHtml({ b: `${b.slice(0, -4)}AAAA` });
    expect(html).not.toContain(SUMMARY);
    expect(html).toContain('Written by Saans from your plan');
  });
});

describe('POST /plan/[token]/explain', () => {
  it('writes the summary on request and redirects with a sealed draft, keeping day and air', async () => {
    vi.mocked(writeBriefing).mockResolvedValue({ by: 'gemini', lang: 'hi', text: SUMMARY });
    const response = await explainPost(
      formPost('/plan/x/explain', { lang: 'hi', day: 'tomorrow', air: 'smog-day' }),
      context(TOKEN),
    );
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location.startsWith(`/plan/${TOKEN}?`)).toBe(true);
    expect(location).toMatch(/#summary$/);
    const params = query(location);
    expect(params.get('lang')).toBe('hi');
    expect(params.get('day')).toBe('tomorrow');
    expect(params.get('air')).toBe('smog-day');
    expect(openWritten(params.get('b') ?? '')).toEqual({ by: 'gemini', lang: 'hi', text: SUMMARY });
    expect(writeBriefing).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeBriefing).mock.calls[0]?.[0].lang).toBe('hi');
  });

  it('carries the note when the template stood in', async () => {
    vi.mocked(writeBriefing).mockResolvedValue({
      by: 'template',
      lang: 'en',
      text: SUMMARY,
      note: 'Paused.',
    });
    const location = locationOf(
      await explainPost(formPost('/plan/x/explain', { lang: 'en' }), context(TOKEN)),
    );
    expect(openWritten(query(location).get('b') ?? '')).toEqual({
      by: 'template',
      lang: 'en',
      text: SUMMARY,
      note: 'Paused.',
    });
  });

  it('swaps in the plain text when the written one would not fit in a link', async () => {
    // Pseudo-random CJK text, which deflate cannot shrink enough to fit a link.
    let seed = 7;
    const noisy = Array.from({ length: 1500 }, () => {
      seed = (seed * 48271) % 2147483647;
      return String.fromCodePoint(0x4e00 + (seed % 4000));
    }).join('');
    vi.mocked(writeBriefing).mockResolvedValue({ by: 'gemini', lang: 'hi', text: noisy });
    const location = locationOf(
      await explainPost(formPost('/plan/x/explain', { lang: 'hi' }), context(TOKEN)),
    );
    const shown = openWritten(query(location).get('b') ?? '');
    expect(shown?.by).toBe('template');
    expect(shown?.text).not.toBe(noisy);
  });

  it('refuses a cross-origin post and an expired form without calling the model', async () => {
    const cross = await explainPost(
      formPost('/plan/x/explain', {}, { origin: 'https://evil.example' }),
      context(TOKEN),
    );
    expect(cross.status).toBe(403);
    const old = await explainPost(
      formPost('/plan/x/explain', {}, { token: '1.AAAA' }),
      context(TOKEN),
    );
    expect(old.status).toBe(400);
    expect(writeBriefing).not.toHaveBeenCalled();
  });
});

describe('POST /plan/[token]/community/notice', () => {
  it('writes the notice on request and redirects back with a sealed draft', async () => {
    vi.mocked(writeNotice).mockResolvedValue({ by: 'gemini', lang: 'en', text: SUMMARY });
    const response = await noticePost(
      formPost('/plan/x/community/notice', { kind: 'office', lang: 'en' }),
      context(SCHOOL),
    );
    expect(response.status).toBe(303);
    const location = locationOf(response);
    expect(location.startsWith(`/plan/${SCHOOL}/community?`)).toBe(true);
    expect(location).toMatch(/#notice$/);
    expect(query(location).get('kind')).toBe('office');
    expect(openWritten(query(location).get('n') ?? '')?.text).toBe(SUMMARY);
    expect(vi.mocked(writeNotice).mock.calls[0]?.[0].community.kind).toBe('office');
  });

  it('refuses a cross-origin post and an expired form without calling the model', async () => {
    const cross = await noticePost(
      formPost('/plan/x/community/notice', {}, { origin: 'https://evil.example' }),
      context(SCHOOL),
    );
    expect(cross.status).toBe(403);
    const old = await noticePost(
      formPost('/plan/x/community/notice', {}, { token: '1.AAAA' }),
      context(SCHOOL),
    );
    expect(old.status).toBe(400);
    expect(writeNotice).not.toHaveBeenCalled();
  });
});
