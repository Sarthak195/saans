// The start-up environment check, called once from the instrumentation hook in production.
// Server layer (I/O). It reads the environment through getEnv and holds no state of its own.
import 'server-only';

import { getEnv } from '@/server/env';

/**
 * Stops the process when the environment is wrong. Throwing from the startup hook leaves Next
 * listening and failing every request, so the platform would still call the revision started.
 * The message names each bad variable and never a value.
 */
export function exitOnBadEnv(): void {
  try {
    // getEnv validates every variable and throws one error that lists all the problems.
    getEnv();
  } catch (error) {
    // The error text is safe to print: it names variables and what is wrong, never a value.
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid environment'}\n`);
    process.exit(1);
  }
}
