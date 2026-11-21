import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The environment is read once per module instance, so each test starts from a fresh one.
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function health(): Promise<Response> {
  const { GET } = await import('@/app/api/health/route');
  return GET();
}

describe('GET /api/health', () => {
  it('reports ok and forbids caching when the environment is valid', async () => {
    vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('is not ok when a key is missing, and shows no value', async () => {
    vi.stubEnv('SEAL_KEY', '');
    vi.stubEnv('FORM_KEY', 'not-a-key-secret');
    const response = await health();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('{"status":"misconfigured"}');
  });

  it('is not ok when both keys are the same value', async () => {
    const same = randomBytes(32).toString('base64');
    vi.stubEnv('SEAL_KEY', same);
    vi.stubEnv('FORM_KEY', same);
    const response = await health();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(same);
  });
});
