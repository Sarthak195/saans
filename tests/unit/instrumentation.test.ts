import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The environment is read once per module instance, so each test starts from a fresh one.
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function boot(): Promise<void> {
  const { register } = await import('@/instrumentation');
  await register();
}

describe('register', () => {
  it('stops a production server that starts with a bad key', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEAL_KEY', '');
    vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
    await expect(boot()).rejects.toThrow(/Invalid environment/);
  });

  it('lets a production server with good keys start', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEAL_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('FORM_KEY', randomBytes(32).toString('base64'));
    await expect(boot()).resolves.toBeUndefined();
  });

  it('checks nothing in development or on the edge runtime', async () => {
    vi.stubEnv('SEAL_KEY', '');
    vi.stubEnv('FORM_KEY', '');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'development');
    await expect(boot()).resolves.toBeUndefined();
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(boot()).resolves.toBeUndefined();
  });
});
