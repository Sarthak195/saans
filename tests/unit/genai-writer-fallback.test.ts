import { beforeAll, describe, expect, it, vi } from 'vitest';

import { HINDI_UNAVAILABLE, polarityRefs } from '@/core/briefing';
import { AppError } from '@/server/errors';
import type { GenaiDeps, ModelCall, ModelRequest } from '@/server/genai/model';
import { briefingWithDeps, noticeWithDeps } from '@/server/genai/writer';

import {
  MODELS,
  depsWith,
  familyCase,
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
