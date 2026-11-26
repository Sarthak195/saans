// A liveness probe for the platform. Layer: route (src/app). It reports that the process is
// serving requests and touches no upstream, so an outage elsewhere never takes the instance out
// of rotation. It does check the environment, since a revision with bad keys cannot serve
// anything. No value is shown.
import { getEnv } from '@/server/env';

/** Makes the route run on every request instead of being built once. */
export const dynamic = 'force-dynamic';

// Tells browsers and proxies not to keep the answer.
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Answers 200 with status ok when the environment loads, or 503 with status misconfigured. */
export function GET(): Response {
  // getEnv throws when a setting is missing or invalid. The error text is not sent back.
  try {
    getEnv();
  } catch {
    return Response.json({ status: 'misconfigured' }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ status: 'ok' }, { headers: NO_STORE });
}
