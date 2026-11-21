// A quick check of a running server: npm run build && npm start, then BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts
// It checks status codes, the security policy header, and that no page contains an em-dash or en-dash.

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Built from code points so this file does not itself contain the characters it forbids.
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);

const SAMPLE_IDS = ['s1', 's2', 's3', 's4', 's5', 's6'];
const PAGES = [
  '/',
  '/about',
  '/household',
  ...SAMPLE_IDS.map((id) => `/plan/sample/${id}`),
  '/plan/sample/s6/community',
  '/plan/sample/s1?air=smog-day',
];

interface Failure {
  path: string;
  problem: string;
}

async function check(path: string, expected: number, isPage: boolean): Promise<Failure[]> {
  const failures: Failure[] = [];
  const fail = (problem: string): void => {
    failures.push({ path, problem });
  };
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

  const policy = response.headers.get('content-security-policy');
  if (policy === null) fail('no Content-Security-Policy header');
  else if (!/script-src[^;]*'nonce-[^']+'/.test(policy)) fail('policy has no script nonce');

  const body = await response.text();
  if (DASHES.test(body)) fail('the page contains an em-dash or en-dash');
  if (isPage && !body.includes('<h1')) fail('the page has no h1');
  if (
    isPage &&
    path.startsWith('/plan/') &&
    !(response.headers.get('cache-control') ?? '').includes('no-store')
  ) {
    fail('a plan page must send Cache-Control: no-store');
  }
  return failures;
}

async function main(): Promise<void> {
  const results = await Promise.all([
    ...PAGES.map((path) => check(path, 200, true)),
    check('/api/health', 200, false),
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
