// The repository checks behind `npm run check:repo`: no private planning files tracked, no
// em-dash or en-dash in tracked text, a size limit, and a size report. It reads git and the
// files, and exits with 1 when any check fails. The rules themselves live in repo-rules.ts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

import {
  bucketOf,
  countLines,
  findDashes,
  findPlanningPaths,
  formatReport,
  isBinary,
  MAX_TOTAL_BYTES,
  type SizeReport,
} from './repo-rules';

// Reads git's own list, so untracked and ignored files never count and the result matches
// what anyone would get by cloning. Run it after committing new files.
// -z separates names with a NUL byte, so unusual file names need no unquoting. The buffer is
// 64 MiB. A path listed by git but missing from disk (deleted, not yet staged) is skipped.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0')
  .filter((path) => path !== '' && existsSync(path));

// Every problem found, printed together at the end.
const problems: string[] = [];

for (const path of findPlanningPaths(tracked)) {
  problems.push(`Private planning file is tracked: ${path}`);
}

// Running totals for the size report: bytes of every tracked file, and lines per bucket.
let bytes = 0;
const lines = { src: 0, 'src/data': 0, tests: 0, 'tests/fixtures': 0 };

for (const path of tracked) {
  const content = readFileSync(path);
  bytes += statSync(path).size;
  // Binary files count toward the size but are not searched for dashes or counted in lines.
  if (isBinary(content)) continue;

  const text = content.toString('utf8');
  for (const { line, dash } of findDashes(path, text)) {
    problems.push(`${path}:${String(line)}: ${dash} (use a comma, colon or parentheses)`);
  }
  // Files outside src and tests (the 'other' bucket) are not counted in the line totals.
  const bucket = bucketOf(path);
  if (bucket !== 'other') lines[bucket] += countLines(text);
}

// The whole tracked tree must stay within the size limit.
if (bytes > MAX_TOTAL_BYTES) {
  problems.push(`Repository is ${String(bytes)} bytes, over the ${String(MAX_TOTAL_BYTES)} limit`);
}

const report: SizeReport = { files: tracked.length, bytes, lines };
console.log(formatReport(report));

// The report always prints; problems go to stderr and fail the run.
if (problems.length > 0) {
  console.error(`\n${String(problems.length)} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nRepository checks passed.');
