import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, type AppErrorKind } from '@/server/errors';
import { classifyError } from '@/server/genai/classify';
import { climb, isOutage, noteFor } from '@/server/genai/ladder';
import type { ModelRequest } from '@/server/genai/model';

// The SDK is replaced, so these tests prove what the module sends and how it reads a reply
// without a network or a key.
const create = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create };
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

const { makeGeminiCall, CALL_TIMEOUT_MS } = await import('@/server/genai/client');

const request: ModelRequest = {
  model: 'gemini-3.5-flash-lite',
  system: 'Fixed instructions',
  input: 'Variable facts',
  temperature: 0,
  thinking: 'low',
  maxOutputTokens: 900,
};

beforeEach(() => {
  create.mockReset();
  constructed.mockReset();
});

async function kindOf(promise: Promise<unknown>): Promise<AppErrorKind | 'resolved'> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    if (error instanceof AppError) return error.kind;
    throw error;
  }
}

describe('the Gemini call', () => {
  it('sends the request in the Interactions shape, stores nothing and takes the output text', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: 'hello' });
    const text = await makeGeminiCall('test-key')({ ...request, schema: { type: 'object' } });

    expect(text).toBe('hello');
    expect(constructed).toHaveBeenCalledWith({ apiKey: 'test-key' });
    const [body, options] = create.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body).toEqual({
      model: 'gemini-3.5-flash-lite',
      store: false,
      input: 'Variable facts',
      system_instruction: 'Fixed instructions',
      response_format: { type: 'text', mime_type: 'application/json', schema: { type: 'object' } },
      generation_config: { temperature: 0, thinking_level: 'low', max_output_tokens: 900 },
      automatic_continuation: false,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.retries).toEqual({ strategy: 'none' });
    expect(CALL_TIMEOUT_MS).toBe(6000);
  });

  it('asks for plain text when there is no schema', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: 'plain' });
    await makeGeminiCall('k')(request);
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('response_format');
  });

  it('builds a new client for each call instead of holding one', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: 'x' });
    const call = makeGeminiCall('k');
    await call(request);
    await call(request);
    expect(constructed).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ status: 'incomplete', output_text: '{"a"' }, 'genai_schema'],
    [{ status: 'failed' }, 'genai_unavailable'],
    [{ status: 'in_progress' }, 'genai_unavailable'],
    [{ status: 'completed', output_text: '  ' }, 'genai_blocked'],
    [{ status: 'completed' }, 'genai_blocked'],
  ] as const)('refuses a reply that is not a finished text: %j', async (reply, kind) => {
    create.mockResolvedValue(reply);
    expect(await kindOf(makeGeminiCall('k')(request))).toBe(kind);
  });

  it('turns an SDK failure into the app kind without carrying its message', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('key=SECRET-KEY text=family details'), { status: 429 }),
    );
    try {
      await makeGeminiCall('SECRET-KEY')(request);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).kind).toBe('genai_quota');
      expect(JSON.stringify(error)).not.toContain('SECRET');
      expect((error as AppError).message).not.toContain('family details');
    }
  });
});

describe('classifying failures', () => {
  const failing = (message: string, extra: Record<string, unknown> = {}, name = 'Error'): Error =>
    Object.assign(new Error(message), { name }, extra);

  it.each([
    [failing('too many requests', { status: 429 }), 'genai_quota'],
    [failing('RESOURCE_EXHAUSTED: quota exceeded'), 'genai_quota'],
    [failing('Request timed out', {}, 'APIConnectionTimeoutError'), 'genai_timeout'],
    [failing('aborted', {}, 'TimeoutError'), 'genai_timeout'],
    [failing('gateway', { status: 504 }), 'genai_timeout'],
    [failing('Response blocked by SAFETY filter'), 'genai_blocked'],
    [failing('PROHIBITED_CONTENT'), 'genai_blocked'],
    [failing('boom', { status: 500 }), 'genai_unavailable'],
    [failing('API key not valid', { status: 400 }), 'genai_unavailable'],
    ['not even an error', 'genai_unavailable'],
  ] as const)('sorts %s', (error, kind) => {
    expect(classifyError(error).kind).toBe(kind);
  });

  it('passes an app error through unchanged', () => {
    const error = new AppError('genai_schema');
    expect(classifyError(error)).toBe(error);
  });
});

describe('the ladder', () => {
  it('stops at the first success', async () => {
    const attempt = vi.fn(() => Promise.resolve('ok'));
    expect(await climb(['a', 'b'], attempt, () => true)).toEqual({
      ok: true,
      value: 'ok',
      model: 'a',
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('moves to the next model only for the kinds it is told to', async () => {
    const attempt = vi.fn((model: string) =>
      model === 'a' ? Promise.reject(new AppError('genai_blocked')) : Promise.resolve('later'),
    );
    expect(await climb(['a', 'b'], attempt, isOutage)).toEqual({
      ok: false,
      kind: 'genai_blocked',
    });
    expect(await climb(['a', 'b'], attempt, () => true)).toMatchObject({ ok: true, model: 'b' });
  });

  it('tries a model listed twice once, and reports the last failure', async () => {
    const attempt = vi.fn(() => Promise.reject(new AppError('genai_quota')));
    expect(await climb(['a', 'a'], attempt, isOutage)).toEqual({ ok: false, kind: 'genai_quota' });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('counts the quota, the clock and the service as outages, not the content', () => {
    expect(
      ['genai_quota', 'genai_timeout', 'genai_unavailable'].every((k) =>
        isOutage(k as AppErrorKind),
      ),
    ).toBe(true);
    expect(isOutage('genai_blocked')).toBe(false);
    expect(isOutage('genai_schema')).toBe(false);
  });

  it('writes a note a parent can read', () => {
    expect(noteFor('genai_quota')).toBe(
      'The AI wording is paused for now. The free daily limit for the AI writer has been reached. The plan below is still worked out in full.',
    );
  });
});
