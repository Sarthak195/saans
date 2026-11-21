import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exit = vi.spyOn(process, 'exit');
const stderr = vi.spyOn(process.stderr, 'write');

// The environment is read once per module instance, so each test starts from a fresh one.
beforeEach(() => {
  vi.resetModules();
  exit.mockReset();
  exit.mockImplementation((() => undefined) as never);
  stderr.mockReset();
  stderr.mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function boot(): Promise<void> {
  const { register } = await import('@/instrumentation');
  await register();
}

const key = (): string => randomBytes(32).toString('base64');

describe('register', () => {
  it('stops a production server that starts with a bad key, naming it but not its value', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEAL_KEY', 'not-a-key-secret');
    vi.stubEnv('FORM_KEY', key());
    await boot();
    expect(exit).toHaveBeenCalledWith(1);
    const message = stderr.mock.calls.map(([text]) => String(text)).join('');
    expect(message).toContain('SEAL_KEY');
    expect(message).not.toContain('secret');
  });

  it('stops a production server that uses one value for both keys', async () => {
    const same = key();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEAL_KEY', same);
    vi.stubEnv('FORM_KEY', same);
    await boot();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('lets a production server with good keys start', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEAL_KEY', key());
    vi.stubEnv('FORM_KEY', key());
    await boot();
    expect(exit).not.toHaveBeenCalled();
  });

  it('checks nothing in development or on the edge runtime', async () => {
    vi.stubEnv('SEAL_KEY', '');
    vi.stubEnv('FORM_KEY', '');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'development');
    await boot();
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NODE_ENV', 'production');
    await boot();
    expect(exit).not.toHaveBeenCalled();
  });
});
