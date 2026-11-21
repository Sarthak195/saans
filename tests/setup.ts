import { afterEach, vi } from 'vitest';

// A test that reaches the network is flaky and can cost money, so an unmocked call fails
// loudly. A test that needs fetch installs its own stub with vi.stubGlobal('fetch', ...).
function blockedFetch(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return Promise.reject(new Error(`Unmocked network call: ${url}`));
}

vi.stubGlobal('fetch', blockedFetch);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', blockedFetch);
});
