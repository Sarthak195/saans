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
// what a reviewer would clone. Run it after committing new files.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0')
  .filter((path) => path !== '' && existsSync(path));

const problems: string[] = [];

for (const path of findPlanningPaths(tracked)) {
  problems.push(`Private planning file is tracked: ${path}`);
}

let bytes = 0;
const lines = { src: 0, 'src/data': 0, tests: 0, 'tests/fixtures': 0 };

for (const path of tracked) {
  const content = readFileSync(path);
  bytes += statSync(path).size;
  if (isBinary(content)) continue;

  const text = content.toString('utf8');
  for (const { line, dash } of findDashes(path, text)) {
    problems.push(`${path}:${String(line)}: ${dash} (use a comma, colon or parentheses)`);
  }
  const bucket = bucketOf(path);
  if (bucket !== 'other') lines[bucket] += countLines(text);
}

if (bytes > MAX_TOTAL_BYTES) {
  problems.push(`Repository is ${String(bytes)} bytes, over the ${String(MAX_TOTAL_BYTES)} limit`);
}

const report: SizeReport = { files: tracked.length, bytes, lines };
console.log(formatReport(report));

if (problems.length > 0) {
  console.error(`\n${String(problems.length)} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nRepository checks passed.');
