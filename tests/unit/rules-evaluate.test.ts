import { describe, expect, it } from 'vitest';

import { allMatches, firstMatch, matches, type FactValue, type Rule } from '@/core/rules/evaluate';
import type { SourceRef } from '@/core/source';

interface Facts extends Record<string, FactValue> {
  level: string;
  sensitive: boolean;
  hour: number;
}

const source: SourceRef = {
  id: 'test',
  title: 'Test rule',
  url: 'https://example.org',
  status: 'APP',
};
const rules: Rule<Facts, string>[] = [
  {
    id: 'severe-sensitive',
    when: { level: ['severe'], sensitive: [true] },
    then: 'indoors',
    source,
  },
  { id: 'severe', when: { level: ['severe'] }, then: 'lighten', source },
  { id: 'default', when: {}, then: 'keep', source },
];

describe('rule evaluation', () => {
  it('matches when every named fact is one of the allowed values', () => {
    expect(
      matches({ level: ['poor', 'severe'] }, { level: 'poor', sensitive: false, hour: 9 }),
    ).toBe(true);
    expect(
      matches({ level: ['poor'], hour: [7, 8] }, { level: 'poor', sensitive: false, hour: 9 }),
    ).toBe(false);
  });

  it('treats an empty condition as matching everything', () => {
    expect(matches({}, { level: 'good', sensitive: true, hour: 0 })).toBe(true);
  });

  it('lets the first, most specific rule decide', () => {
    expect(firstMatch(rules, { level: 'severe', sensitive: true, hour: 17 })?.id).toBe(
      'severe-sensitive',
    );
    expect(firstMatch(rules, { level: 'severe', sensitive: false, hour: 17 })?.id).toBe('severe');
    expect(firstMatch(rules, { level: 'good', sensitive: true, hour: 17 })?.id).toBe('default');
  });

  it('returns no rule when nothing matches', () => {
    expect(
      firstMatch(rules.slice(0, 2), { level: 'good', sensitive: false, hour: 1 }),
    ).toBeUndefined();
  });

  it('collects every applicable rule in order', () => {
    expect(
      allMatches(rules, { level: 'severe', sensitive: true, hour: 6 }).map((r) => r.id),
    ).toEqual(['severe-sensitive', 'severe', 'default']);
  });
});
