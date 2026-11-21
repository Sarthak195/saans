// A liveness probe for the platform: it reports that the process is serving requests and
// touches no upstream, so an outage elsewhere never takes the instance out of rotation.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
