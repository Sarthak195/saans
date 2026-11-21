import { getEnv } from '@/server/env';

// A liveness probe for the platform: it reports that the process is serving requests and
// touches no upstream, so an outage elsewhere never takes the instance out of rotation. It does
// check the environment, since a revision with bad keys cannot serve anything. No value is shown.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function GET(): Response {
  try {
    getEnv();
  } catch {
    return Response.json({ status: 'misconfigured' }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ status: 'ok' }, { headers: NO_STORE });
}
