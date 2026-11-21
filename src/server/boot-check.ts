import 'server-only';

import { getEnv } from '@/server/env';

/**
 * Stops the process when the environment is wrong. Throwing from the startup hook leaves Next
 * listening and failing every request, so the platform would still call the revision started.
 * The message names each bad variable and never a value.
 */
export function exitOnBadEnv(): void {
  try {
    getEnv();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid environment'}\n`);
    process.exit(1);
  }
}
