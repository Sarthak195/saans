import { beforeAll, describe, expect, it, vi } from 'vitest';

import { HINDI_UNAVAILABLE, briefingFacts, polarityRefs } from '@/core/briefing';
import { AppError } from '@/server/errors';
import type { GenaiDeps, ModelCall, ModelRequest } from '@/server/genai/model';
import { briefingWithDeps, noticeWithDeps } from '@/server/genai/writer';

import {
  MODELS,
  depsWith,
  familyCase,
  loadFixture,
  replay,
  schoolCase,
  type FamilyCase,
} from '../helpers/genai';

let family: FamilyCase;
let school: Awaited<ReturnType<typeof schoolCase>>;

beforeAll(async () => {
  family = await familyCase();
  school = await schoolCase();
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

  it('allows a warning that uses the word safe', async () => {
    const { written } = await attempt(
      'Sat 21 Nov has Very Poor air with an AQI of 302. Do routine_1 indoors at 06:30. Playing outside for routine_2 at 17:00 is not safe today.',
    );
    expect(written.by).toBe('gemini');
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
});

describe('when the model cannot be used', () => {
  it.each([
    ['genai_quota', /free daily limit/],
    ['genai_timeout', /did not finish in time/],
    ['genai_unavailable', /not reachable/],
    ['genai_blocked', /declined to word/],
  ] as const)(
    'falls back to the template after %s on both models, with a note',
    async (kind, note) => {
      const call = vi.fn<ModelCall>(() => Promise.reject(new AppError(kind)));
      const written = await briefing(depsWith(call));
      expect(call).toHaveBeenCalledTimes(2);
      expect(written).toMatchObject({ by: 'template', lang: 'en' });
      expect(written.note).toMatch(note);
      expect(written.text).toContain("Grandmother's walk at 06:30: stay indoors");
      expect(written.text).not.toMatch(/\bsafe\b/i);
    },
  );

  it('uses the template with a note when there is no key, without calling anything', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const written = await briefing(depsWith(null));
    expect(written.by).toBe('template');
    expect(written.note).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers a Hindi request with the English template and says so', async () => {
    const written = await briefing(depsWith(null), 'hi');
    expect(written).toMatchObject({ by: 'template', lang: 'en', note: HINDI_UNAVAILABLE });
  });
});

describe('the cache', () => {
  it('stores the text before names go in, under a key made only from facts', async () => {
    const stored: Record<string, string> = {};
    const call = vi.fn<ModelCall>(replay('briefing-en'));
    const deps: GenaiDeps = {
      call,
      models: MODELS,
      cache: async (key, produce) => (stored[key] ??= await produce()),
    };
    const first = await briefing(deps);
    const second = await briefing(deps);
    expect(call).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    const [key = '', kept = ''] = Object.entries(stored)[0] ?? [];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(kept).toMatch(/routine_1/);
    expect(kept).not.toContain('Grandmother');
  });

  it('keeps a language and an audience apart', async () => {
    const keys = new Set<string>();
    const deps: GenaiDeps = {
      call: replay('briefing-en'),
      models: MODELS,
      cache: (key, produce) => (keys.add(key), produce()),
    };
    await briefing(deps, 'en');
    await briefing(deps, 'hi');
    await noticeWithDeps({ ...school, lang: 'en' }, deps);
    expect(keys.size).toBe(3);
  });

  it('does not remember a failure', async () => {
    const stored: Record<string, string> = {};
    let healthy = false;
    const call: ModelCall = () =>
      healthy
        ? replay('briefing-en')({} as ModelRequest)
        : Promise.reject(new AppError('genai_quota'));
    const deps: GenaiDeps = {
      call,
      models: MODELS,
      cache: async (key, produce) => (stored[key] ??= await produce()),
    };
    expect((await briefing(deps)).by).toBe('template');
    healthy = true;
    expect((await briefing(deps)).by).toBe('gemini');
  });
});

describe('the community notice', () => {
  it('uses the recorded notice when it passes the checks', async () => {
    const written = await noticeWithDeps({ ...school, lang: 'en' }, depsWith(replay('notice-s6')));
    expect(written.by).toBe('gemini');
    expect(written.text).toContain('302');
  });

  it('rejects an invented number or a reassurance and falls back to the template notice', async () => {
    for (const text of [
      'Sat 21 Nov has Very Poor air with an AQI of 450. Please keep classroom windows shut. Wet mop the floors.',
      'Sat 21 Nov has Very Poor air with an AQI of 302. Outdoor sports are safe at 12:00. Please keep classroom windows shut.',
    ]) {
      const written = await noticeWithDeps({ ...school, lang: 'en' }, depsWith(reply(text)));
      expect(written.by).toBe('template');
      expect(written.text).toMatch(/^Air notice for our school/);
      expect(written.note).toBeTruthy();
    }
  });

  it('says in English that Hindi is unavailable when the notice falls back', async () => {
    const written = await noticeWithDeps({ ...school, lang: 'hi' }, depsWith(null));
    expect(written).toMatchObject({ by: 'template', lang: 'en', note: HINDI_UNAVAILABLE });
  });
});

describe('the polarity refs', () => {
  it('list every routine with its decision and every member as a keep', () => {
    const refs = polarityRefs(family.plan);
    expect(refs).toContainEqual({ ref: 'routine_2', decision: 'indoors' });
    expect(refs).toContainEqual({ ref: 'member_1', decision: 'keep' });
  });
});
