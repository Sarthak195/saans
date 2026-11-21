import { beforeAll, describe, expect, it, vi } from 'vitest';

import { briefingFacts } from '@/core/briefing';
import type { GenaiDeps, ModelCall, ModelRequest } from '@/server/genai/model';
import { briefingWithDeps } from '@/server/genai/writer';

import {
  MODELS,
  depsWith,
  familyCase,
  loadFixture,
  replay,
  type FamilyCase,
} from '../helpers/genai';

let family: FamilyCase;

beforeAll(async () => {
  family = await familyCase();
});

const briefing = (deps: GenaiDeps, lang: 'en' | 'hi' = 'en') =>
  briefingWithDeps({ ...family, lang }, deps);
const reply =
  (text: string): ModelCall =>
  () =>
    Promise.resolve(text);

describe('the recorded briefing', () => {
  it('passes its checks and gets the family labels only afterwards', async () => {
    const seen: ModelRequest[] = [];
    const written = await briefing(depsWith(replay('briefing-en', seen)));
    expect(written.by).toBe('gemini');
    expect(written.note).toBeUndefined();
    // The model wrote about routine_1 and routine_2; the family sees their own words.
    expect(written.text).toContain("Grandmother's walk");
    expect(written.text).toContain("Son's outdoor play");
    expect(written.text).not.toMatch(/routine_\d|member_\d/);

    // Nothing that names or describes the family went to the model.
    const sent = `${seen[0]?.system ?? ''} ${seen[0]?.input ?? ''}`;
    for (const private_ of ['Grandmother', 'Son', 'Parent', 'asthma', 'Lajpat']) {
      expect(sent).not.toContain(private_);
    }
    expect(seen[0]).toMatchObject({ model: 'primary-model', thinking: 'minimal' });
  });

  it('is asked in the language requested, and the Hindi reply passes with ASCII digits', async () => {
    const seen: ModelRequest[] = [];
    const written = await briefing(depsWith(replay('briefing-hi', seen)), 'hi');
    expect(written.by).toBe('gemini');
    expect(written.lang).toBe('hi');
    expect(written.text).toMatch(/\p{Script=Devanagari}/u);
    expect(written.text).toContain('06:30');
    expect(JSON.parse(seen[0]?.input ?? '{}')).toMatchObject({ lang: 'hi' });
    // A Hindi briefing is written from the structure of the plan, not its English sentences.
    expect(seen[0]?.input).not.toContain('Keep hard exercise');
  });

  it('keeps names and health words out of the facts', () => {
    const facts = JSON.stringify(briefingFacts(family));
    expect(facts).not.toMatch(/Grandmother|Son|Parent|asthma/);
    expect(facts).toContain('member_1');
    expect(facts).toContain('routine_2');
  });
});

describe('checking what the model wrote', () => {
  const fixture = loadFixture('briefing-en').reply;

  async function attempt(text: string) {
    const call = vi.fn<ModelCall>(reply(text));
    const written = await briefing(depsWith(call));
    return { written, call };
  }

  it('rejects a number the plan did not compute and falls back to the template', async () => {
    const { written, call } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 450. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.',
    );
    expect(written.by).toBe('template');
    expect(written.text).not.toContain('AQI of 450');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('rejects a number spelled out in words', async () => {
    const { written } = await attempt(
      'The air quality index is three hundred and ninety today. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.',
    );
    expect(written.by).toBe('template');
  });

  it('rejects a text that leaves out a routine the plan changes', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_2 indoors at 17:00. Open the windows only from 12:00 to 13:00.',
    );
    expect(written.by).toBe('template');
  });

  it('rejects reassurance about a routine the plan changes', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. It is safe for routine_2 at 17:00, so go ahead.',
    );
    expect(written.by).toBe('template');
  });

  it('rejects a general reassuring sentence when the plan moves a routine', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00. Outdoor time is safe for everyone today.',
    );
    expect(written.by).toBe('template');
    const calm = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00. There is nothing to worry about.',
    );
    expect(calm.written.by).toBe('template');
  });

  it('rejects a link or an address in the text', async () => {
    const base =
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.';
    for (const extra of [
      'Read more at https://example.org/air.',
      'See www.example.org for details.',
      'Details are on cpcb.gov today.',
      'Write to help@example.org now.',
    ]) {
      expect((await attempt(`${base} ${extra}`)).written.by).toBe('template');
    }
  });

  it('refuses an hour of the day used as a reading', async () => {
    // 20 is only the hour of an evening reading in the plan, so it is not an AQI.
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 20. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.',
    );
    expect(written.by).toBe('template');
  });

  it('allows an hour written as a time, including the Hindi digits', async () => {
    const hindi =
      'Sat २१ Nov पर हवा बहुत खराब है और AQI ३०२ है। routine_1 को ०६:३० पर घर के अंदर करें। routine_2 को १७:०० पर घर के अंदर करें।';
    expect((await briefingWithDeps({ ...family, lang: 'hi' }, depsWith(reply(hindi)))).by).toBe(
      'gemini',
    );
    const bare = hindi.replace('AQI ३०२', 'AQI २०');
    expect((await briefingWithDeps({ ...family, lang: 'hi' }, depsWith(reply(bare)))).by).toBe(
      'template',
    );
  });

  it('allows a warning that uses the word safe', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Playing outside for routine_2 at 17:00 is not safe today.',
    );
    expect(written.by).toBe('gemini');
  });

  it('rejects reassurance about a member whose routines the plan changes', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00. member_2 is safe to play outside.',
    );
    expect(written.by).toBe('template');
  });

  it('rejects a placeholder the plan never gave', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00. Do routine_7 later.',
    );
    expect(written.by).toBe('template');
  });

  it('rejects markup, a wrong language and a text that is far too short', async () => {
    for (const text of [
      'Sat 21 Nov has Very Poor air. **Do routine_1 indoors at 06:30.** Do routine_2 indoors at 17:00. <b>Stay in</b>.',
      'Sat 21 Nov पर हवा बहुत खराब है। routine_1 को 06:30 पर घर के अंदर करें। routine_2 को 17:00 पर घर के अंदर करें।',
      'Stay in.',
      '',
    ]) {
      expect((await attempt(text)).written.by).toBe('template');
    }
  });

  it('turns dashes into words before the checks', async () => {
    const dash = String.fromCodePoint(0x2013);
    const { written } = await attempt(
      `Sat 21 Nov has Very Poor air with an AQI of 302. The cleanest time is 12:00${dash}15:00. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.`,
    );
    expect(written.by).toBe('gemini');
    expect(written.text).toContain('12:00 to 15:00');
    expect(written.text).not.toContain(dash);
  });

  it('reads Devanagari digits as the same numbers', async () => {
    const hindi =
      'Sat २१ Nov पर हवा बहुत खराब है और AQI ३०२ है। routine_1 को ०६:३० पर घर के अंदर करें। routine_2 को १७:०० पर घर के अंदर करें।';
    const ok = await briefingWithDeps({ ...family, lang: 'hi' }, depsWith(reply(hindi)));
    expect(ok.by).toBe('gemini');
    const invented = await briefingWithDeps(
      { ...family, lang: 'hi' },
      depsWith(reply(hindi.replace('३०२', '४५०'))),
    );
    expect(invented.by).toBe('template');
  });

  it('uses the fallback model once when the first reply fails its checks', async () => {
    const models: string[] = [];
    const call: ModelCall = (request) => {
      models.push(request.model);
      return Promise.resolve(request.model === MODELS.writer ? 'The AQI is 450.' : fixture);
    };
    const written = await briefing(depsWith(call));
    expect(models).toEqual(['primary-model', 'fallback-model']);
    expect(written.by).toBe('gemini');
  });

  it('puts names in only after the checks, so a label cannot affect them', async () => {
    const relabelled = {
      ...family,
      plan: {
        ...family.plan,
        routines: family.plan.routines.map((r) => ({ ...r, memberLabel: 'Routine_9 and 77' })),
        members: family.plan.members.map((m) => ({ ...m, label: 'Member_8 and 99' })),
      },
    };
    const written = await briefingWithDeps(
      { ...relabelled, lang: 'en' },
      depsWith(replay('briefing-en')),
    );
    expect(written.by).toBe('gemini');
    expect(written.text).toContain("Routine_9 and 77's walk");
  });

  it('does not let a label widen the numbers the model may print', async () => {
    const labelled = {
      ...family,
      plan: {
        ...family.plan,
        members: family.plan.members.map((m) => ({ ...m, label: 'Kid 47' })),
      },
    };
    const written = await briefingWithDeps(
      { ...labelled, lang: 'en' },
      depsWith(
        reply(
          'Sat 21 Nov has Very Poor air with an AQI of 47. Do routine_1 indoors at 06:30. Do routine_2 indoors at 17:00.',
        ),
      ),
    );
    expect(written.by).toBe('template');
  });
});
