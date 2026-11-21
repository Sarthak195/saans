import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { templateBriefing, templateNotice } from '@/core/briefing';
import { sampleById } from '@/core/profile/samples';
import { openDraft, openHousehold, sealDraft, sealHousehold } from '@/server/seal';
import type { WrittenText } from '@/server/genai';
import { briefingWithDeps, noticeWithDeps } from '@/server/genai/writer';
import { openWritten, sealWritten } from '@/server/written-draft';
import type { WrittenFor } from '@/server/written-draft';

import { stubKeys } from '../helpers/form';
import { RECORDED_NOW, depsWith, replay } from '../helpers/genai';
import { HINDI_SUMMARY, SUMMARY, writtenFor } from '../helpers/written';

const sample = sampleById('s1');
const school = sampleById('s6');
if (sample === undefined || school === undefined) throw new Error('no sample');

let TOKEN = '';
let OTHER = '';
beforeAll(() => {
  stubKeys();
  TOKEN = sealHousehold(sample.household);
  OTHER = sealHousehold(school.household);
});
beforeEach(() => {
  // No live data: the sample place falls back to its recording.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});

const gemini = (text: string, lang: 'en' | 'hi' = 'en'): WrittenText => ({
  by: 'gemini',
  lang,
  text,
});

function sealedFor(target: WrittenFor, written: WrittenText = gemini(SUMMARY)): string {
  return sealWritten(written, target);
}

describe('written text is bound to the page it was made for', () => {
  it('opens on the page it was sealed for', async () => {
    const target = await writtenFor(sample.household, TOKEN);
    expect(openWritten(sealedFor(target), target)).toEqual(gemini(SUMMARY));
    expect(openWritten(undefined, target)).toBeUndefined();
  });

  it('is refused under another household link', async () => {
    const token = sealedFor(await writtenFor(sample.household, TOKEN));
    const elsewhere = await writtenFor(sample.household, OTHER);
    expect(openWritten(token, elsewhere)).toBeUndefined();
  });

  it('is refused on another day, another air mode and another language', async () => {
    const token = sealedFor(await writtenFor(sample.household, TOKEN));
    for (const other of [{ day: 'tomorrow' }, { air: 'smog-day' }, { lang: 'hi' }] as const) {
      expect(openWritten(token, await writtenFor(sample.household, TOKEN, other))).toBeUndefined();
    }
  });

  it('is refused for another audience, so a summary cannot open as a notice', async () => {
    const summary = sealedFor(await writtenFor(sample.household, TOKEN));
    for (const audience of ['society', 'school', 'office'] as const) {
      const notice = await writtenFor(sample.household, TOKEN, { audience });
      expect(openWritten(summary, notice)).toBeUndefined();
    }
    const asNotice = sealedFor(await writtenFor(sample.household, TOKEN, { audience: 'school' }));
    expect(openWritten(asNotice, await writtenFor(sample.household, TOKEN))).toBeUndefined();
    expect(
      openWritten(asNotice, await writtenFor(sample.household, TOKEN, { audience: 'office' })),
    ).toBeUndefined();
  });

  it('is refused once it is more than six hours old, and when it claims to be from the future', async () => {
    const issued = new Date('2026-11-22T06:00:00.000Z');
    const at = async (seconds: number): Promise<WrittenFor> =>
      writtenFor(sample.household, TOKEN, { now: new Date(issued.getTime() + seconds * 1000) });
    const token = sealedFor(await at(0));
    const six = 6 * 60 * 60;
    // The plan day is the same either way, so only the age decides.
    expect(openWritten(token, { ...(await at(six)), view: (await at(0)).view })).toBeDefined();
    expect(
      openWritten(token, { ...(await at(six + 1)), view: (await at(0)).view }),
    ).toBeUndefined();

    const early = sealedFor(await at(120));
    expect(openWritten(early, { ...(await at(0)), view: (await at(120)).view })).toBeUndefined();
  });

  it('is not an ordinary draft, and a draft is not written text', async () => {
    const target = await writtenFor(sample.household, TOKEN);
    const written = sealedFor(target);
    expect(() => openDraft(written)).toThrow(/unknown version/);
    expect(() => openHousehold(written)).toThrow(/unknown version/);
    expect(openWritten(sealDraft({ text: SUMMARY, options: [] }), target)).toBeUndefined();
    expect(openWritten(`${written.slice(0, -4)}AAAA`, target)).toBeUndefined();
  });
});

describe('written text is checked again before it is shown', () => {
  it('drops a number the plan on this page does not have', async () => {
    const target = await writtenFor(sample.household, TOKEN);
    const bad = sealedFor(target, gemini('The air quality index is 7777 today. Take water along.'));
    expect(openWritten(bad, target)).toBeUndefined();
  });

  it('drops markup, the wrong language and a text with one sentence', async () => {
    const target = await writtenFor(sample.household, TOKEN);
    for (const text of [`<b>${SUMMARY}</b>`, HINDI_SUMMARY, 'Keep the evening walk short.']) {
      expect(openWritten(sealedFor(target, gemini(text)), target)).toBeUndefined();
    }
    const hindi = await writtenFor(sample.household, TOKEN, { lang: 'hi' });
    expect(openWritten(sealedFor(hindi, gemini(SUMMARY, 'hi')), hindi)).toBeUndefined();
    expect(openWritten(sealedFor(hindi, gemini(HINDI_SUMMARY, 'hi')), hindi)?.text).toBe(
      HINDI_SUMMARY,
    );
  });

  it('drops a reassuring sentence on a day that changes the plan, and on every notice', async () => {
    const reassuring = 'Everything is fine today. Outdoor time is safe for everyone.';
    const smog = await writtenFor(sample.household, TOKEN, { air: 'smog-day' });
    expect(smog.view.plan.routines.some((r) => r.decision !== 'keep')).toBe(true);
    expect(openWritten(sealedFor(smog, gemini(reassuring)), smog)).toBeUndefined();

    const notice = await writtenFor(school.household, OTHER, { audience: 'school' });
    expect(openWritten(sealedFor(notice, gemini(reassuring)), notice)).toBeUndefined();
    expect(openWritten(sealedFor(notice, gemini(SUMMARY)), notice)?.text).toBe(SUMMARY);
  });

  it('does not count digits inside a family name or a place name as plan numbers', async () => {
    const named = {
      ...sample.household,
      members: sample.household.members.map((m, i) => (i === 0 ? { ...m, label: 'Aarav 7' } : m)),
    };
    const target = await writtenFor(named, TOKEN);
    const text = 'Keep Aarav 7 close to home this evening. Take water along.';
    expect(openWritten(sealedFor(target, gemini(text)), target)?.text).toBe(text);
  });

  it('builds code-made text again from the page and carries only its note', async () => {
    const target = await writtenFor(sample.household, TOKEN);
    const stale: WrittenText = {
      by: 'template',
      lang: 'en',
      text: 'AQI 999 at 03:00 yesterday.',
      note: 'Paused.',
    };
    const shown = openWritten(sealedFor(target, stale), target);
    expect(shown).toEqual({
      by: 'template',
      lang: 'en',
      text: templateBriefing(target.view.plan),
      note: 'Paused.',
    });
    expect(shown?.text).not.toContain('999');

    const notice = await writtenFor(school.household, OTHER, { audience: 'school' });
    const { community } = notice.view;
    if (community === undefined) throw new Error('no community view');
    expect(openWritten(sealedFor(notice, stale), notice)?.text).toBe(
      templateNotice(notice.view.plan, community),
    );
  });
});

describe('what the writer really produces still opens on its own page', () => {
  async function targetFor(
    id: 's1' | 's6',
    token: string,
    audience: WrittenFor['audience'],
  ): Promise<WrittenFor> {
    const household = sampleById(id)?.household;
    if (household === undefined) throw new Error('no sample');
    return writtenFor(household, token, { audience, now: RECORDED_NOW });
  }

  it.each(['en', 'hi'] as const)('keeps the recorded %s briefing', async (lang) => {
    const target = { ...(await targetFor('s1', TOKEN, 'family')), lang };
    const { view } = target;
    const written = await briefingWithDeps(
      {
        plan: view.plan,
        home: view.home,
        alternatives: view.alternatives,
        household: view.household,
        lang,
      },
      depsWith(replay(`briefing-${lang}`)),
    );
    expect(written.by).toBe('gemini');
    expect(openWritten(sealWritten(written, target), target)).toEqual(written);
  });

  it('keeps the recorded notice', async () => {
    const target = await targetFor('s6', OTHER, 'school');
    const { view } = target;
    if (view.community === undefined) throw new Error('no community view');
    const written = await noticeWithDeps(
      { plan: view.plan, community: view.community, lang: 'en' },
      depsWith(replay('notice-s6')),
    );
    expect(written.by).toBe('gemini');
    expect(openWritten(sealWritten(written, target), target)).toEqual(written);
  });
});
