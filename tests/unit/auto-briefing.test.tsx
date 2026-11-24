import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import SamplePage from '@/app/plan/sample/[id]/page';
import type { GenaiDeps, ModelRequest } from '@/server/genai/model';

import { stubKeys } from '../helpers/form';
import { MODELS, RECORDED_NOW } from '../helpers/genai';

// The framework cache needs the running framework, so here a Map stands in for it. The facts
// key is what decides whether two views share a call, and that is the real one.
const store = new Map<string, string>();
const requests: ModelRequest[] = [];
let failWith: Error | undefined;

vi.mock('@/server/genai/config', () => ({
  defaultDeps: (): GenaiDeps => ({
    call: (request) => {
      requests.push(request);
      if (failWith !== undefined) return Promise.reject(failWith);
      // Names every routine the facts list, so the reply passes the checks on any plan.
      const facts = JSON.parse(request.input) as { routines: { ref: string; decision: string }[] };
      const lines = facts.routines.map((r) => `Note that ${r.ref} is set to ${r.decision}.`);
      return Promise.resolve(`${lines.join(' ')} Take water along.`);
    },
    models: MODELS,
    cache: async (key, produce) => {
      const kept = store.get(key);
      if (kept !== undefined) return kept;
      const fresh = await produce();
      store.set(key, fresh);
      return fresh;
    },
  }),
}));

beforeAll(stubKeys);
beforeEach(() => {
  // The recording is read at its own day and the page keeps the real time of day, so the clock is fixed.
  vi.setSystemTime(RECORDED_NOW);
  store.clear();
  requests.length = 0;
  failWith = undefined;
  // No live data: the sample place falls back to its recording.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
});

afterEach(() => {
  vi.useRealTimers();
});

function view(id: string, searchParams: Record<string, string> = {}): Promise<string> {
  return SamplePage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  }).then(renderToStaticMarkup);
}

describe('the automatic summary on a plan page', () => {
  it('makes one model call for two views of the same plan, and shows Gemini on both', async () => {
    const first = await view('s1');
    const second = await view('s1');
    expect(requests).toHaveLength(1);
    for (const html of [first, second]) {
      expect(html).toContain('Written by Gemini from your plan; every number checked by Saans');
    }
  });

  it('makes another call for a different plan', async () => {
    await view('s1');
    await view('s1', { day: 'tomorrow' });
    await view('s2');
    expect(requests).toHaveLength(3);
  });

  it('makes no call for the smog day recording', async () => {
    const html = await view('s1', { air: 'smog-day' });
    expect(requests).toHaveLength(0);
    expect(html).toContain('Written by Saans from your plan');
  });

  it('shows the code-built summary when the model fails, and does not remember the failure', async () => {
    failWith = new Error('quota');
    const html = await view('s1');
    expect(html).toContain('Written by Saans from your plan');
    expect(store.size).toBe(0);
    // Both models were tried once before the page gave up.
    expect(requests).toHaveLength(2);
    failWith = undefined;
    expect(await view('s1')).toContain('Written by Gemini from your plan');
    expect(requests).toHaveLength(3);
  });
});
