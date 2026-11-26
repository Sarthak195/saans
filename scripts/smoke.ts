// A quick check of a running server. Start it with `npm run build && npm start`, then run
//   BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts
// It checks status codes, the security policy header, and that no page contains an em-dash or
// en-dash. It makes real requests to the server and exits with 1 when any check fails.

// The server to check, without a trailing slash.
const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Built from code points so this file does not itself contain the characters it forbids.
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);

// The sample places that ship with the app, and every page that must answer 200 with an h1.
const SAMPLE_IDS = ['s1', 's2', 's3', 's4', 's5', 's6'];
const PAGES = [
  '/',
  '/about',
  '/household',
  ...SAMPLE_IDS.map((id) => `/plan/sample/${id}`),
  '/plan/sample/s6/community',
  '/plan/sample/s1?air=smog-day',
];

// One failed check: the path asked for and what was wrong with it.
interface Failure {
  path: string;
  problem: string;
}

// Fetches one path and returns every problem found. `isPage` marks an HTML page, which must
// also have an h1 and, for a plan, a no-store cache header.
async function check(path: string, expected: number, isPage: boolean): Promise<Failure[]> {
  const failures: Failure[] = [];
  const fail = (problem: string): void => {
    failures.push({ path, problem });
  };
  // Redirects are not followed, so a redirect shows up as its own status code.
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  } catch (error) {
    return [
      { path, problem: `request failed: ${error instanceof Error ? error.message : 'unknown'}` },
    ];
  }
  if (response.status !== expected)
    fail(`status ${String(response.status)}, expected ${String(expected)}`);

  // The page must carry a Content-Security-Policy whose script-src names a nonce, as in
  // script-src 'nonce-abc123'.
  const policy = response.headers.get('content-security-policy');
  if (policy === null) fail('no Content-Security-Policy header');
  else if (!/script-src[^;]*'nonce-[^']+'/.test(policy)) fail('policy has no script nonce');

  const body = await response.text();
  if (DASHES.test(body)) fail('the page contains an em-dash or en-dash');
  if (isPage && !body.includes('<h1')) fail('the page has no h1');
  // A plan page holds one family's plan, so it must never be cached.
  if (
    isPage &&
    path.startsWith('/plan/') &&
    !(response.headers.get('cache-control') ?? '').includes('no-store')
  ) {
    fail('a plan page must send Cache-Control: no-store');
  }
  return failures;
}

// Runs every check at once, then prints one line per path in a fixed order.
async function main(): Promise<void> {
  const results = await Promise.all([
    ...PAGES.map((path) => check(path, 200, true)),
    check('/api/health', 200, false),
    // A sample id that does not exist must answer 404, not an error page.
    check('/plan/sample/s9', 404, false),
  ]);
  const failures = results.flat();
  for (const path of [...PAGES, '/api/health', '/plan/sample/s9']) {
    const bad = failures.filter((f) => f.path === path);
    console.log(
      `${bad.length === 0 ? 'ok  ' : 'FAIL'} ${path}${bad.map((f) => `\n       ${f.problem}`).join('')}`,
    );
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
