/** Runs once when the server starts, so a bad or missing key stops the deploy instead of failing every request. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { getEnv } = await import('@/server/env');
  getEnv();
}
