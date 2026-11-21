import { describe, expect, it } from 'vitest';

import {
  bucketOf,
  countLines,
  findDashes,
  findPlanningPaths,
  formatReport,
  isBinary,
} from '../../scripts/repo-rules';

const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);

describe('findPlanningPaths', () => {
  it('flags the planning folder and anything inside it', () => {
    expect(findPlanningPaths(['.planning/a.md', '.planning', 'src/a.ts'])).toEqual([
      '.planning/a.md',
      '.planning',
    ]);
  });

  it('does not flag look-alike names', () => {
    expect(findPlanningPaths(['.planning-notes.md', 'docs/.planning/x'])).toEqual([]);
  });
});

describe('findDashes', () => {
  it('reports each dash with its line', () => {
    const text = `fine\nem ${EM} here\nen ${EN} here\nboth ${EM}${EN}\n`;
    expect(findDashes('a.md', text)).toEqual([
      { path: 'a.md', line: 2, dash: 'em-dash' },
      { path: 'a.md', line: 3, dash: 'en-dash' },
      { path: 'a.md', line: 4, dash: 'em-dash' },
      { path: 'a.md', line: 4, dash: 'en-dash' },
    ]);
  });

  it('allows hyphens and minus signs', () => {
    expect(findDashes('a.md', 'a-b and 5 - 3 and --flag')).toEqual([]);
  });

  it('skips the generated lockfile', () => {
    expect(findDashes('package-lock.json', EM)).toEqual([]);
  });
});

describe('isBinary', () => {
  it('detects a NUL byte', () => {
    expect(isBinary(new Uint8Array([104, 105, 0, 1]))).toBe(true);
    expect(isBinary(new TextEncoder().encode('plain text'))).toBe(false);
  });
});

describe('countLines', () => {
  it.each([
    ['', 0],
    ['one', 1],
    ['one\n', 1],
    ['one\ntwo', 2],
    ['one\ntwo\n', 2],
  ])('counts %j as %i', (text, expected) => {
    expect(countLines(text)).toBe(expected);
  });
});

describe('bucketOf', () => {
  it.each([
    ['src/app/page.tsx', 'src'],
    ['src/data/rules.json', 'src/data'],
    ['tests/unit/a.test.ts', 'tests'],
    ['tests/fixtures/air.json', 'tests/fixtures'],
    ['package.json', 'other'],
  ])('puts %s in %s', (path, bucket) => {
    expect(bucketOf(path)).toBe(bucket);
  });
});

describe('formatReport', () => {
  it('lists each count on its own line', () => {
    const text = formatReport({
      files: 3,
      bytes: 1024 * 1024,
      lines: { src: 10, 'src/data': 2, tests: 5, 'tests/fixtures': 1 },
    });
    expect(text).toContain('Tracked files: 3');
    expect(text).toContain('Total size: 1.00 MB');
    expect(text).toContain('Lines in src (without src/data): 10');
    expect(text).toContain('Lines in tests/fixtures: 1');
  });
});
