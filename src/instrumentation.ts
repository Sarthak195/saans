// Next's start-up hook, outside the core. It runs once when the server process starts and
// holds no state.

/** Runs once when the server starts, so a bad or missing key stops the deploy instead of failing every request. */
export async function register(): Promise<void> {
  // Only the production Node server checks its environment: not the edge runtime, development or
  // tests.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  // Imported here so it is loaded only when the guard above passes.
  const { exitOnBadEnv } = await import('@/server/boot-check');
  exitOnBadEnv();
}
