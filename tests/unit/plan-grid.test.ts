import { describe, expect, it } from 'vitest';

import { BANDS } from '@/core/aqi/breakpoints';
import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';
import {
  GRID,
  NO_WINDOW,
  POOR_DAY,
  PROTECTION,
  RULE_SOURCES,
  TOP_ACTIONS,
} from '@/core/plan/rules-data';
import type { GridFacts } from '@/core/plan/rules-data';
import { INHALATION } from '@/core/impact';
import { firstMatch } from '@/core/rules/evaluate';
import { INTENSITIES } from '@/core/profile/schema';
import type { Intensity, Sensitivity } from '@/core/types';
import { DASHES } from '../helpers/plan';

type Row = readonly [light: Decision, moderate: Decision, vigorous: Decision];

// The decision grid, one row per level and sensitivity, columns light, moderate, vigorous.
// 'move' stands for "a cleaner time if there is one, else the rule's fallback".
const EXPECTED: Record<Band, Record<Sensitivity, Row>> = {
  good: {
    high: ['keep', 'keep', 'keep'],
    raised: ['keep', 'keep', 'keep'],
    general: ['keep', 'keep', 'keep'],
  },
  satisfactory: {
    high: ['keep', 'keep', 'lighten'],
    raised: ['keep', 'keep', 'keep'],
    general: ['keep', 'keep', 'keep'],
  },
  moderate: {
    high: ['lighten', 'lighten', 'move'],
    raised: ['keep', 'keep', 'lighten'],
    general: ['keep', 'keep', 'keep'],
  },
  poor: {
    high: ['move', 'move', 'move'],
    raised: ['lighten', 'move', 'move'],
    general: ['lighten', 'lighten', 'move'],
  },
  very_poor: {
    high: ['indoors', 'indoors', 'indoors'],
    raised: ['move', 'indoors', 'indoors'],
    general: ['lighten', 'move', 'move'],
  },
  severe: {
    high: ['indoors', 'indoors', 'indoors'],
    raised: ['indoors', 'indoors', 'indoors'],
    general: ['indoors', 'indoors', 'indoors'],
  },
};
const SENSITIVITIES: Sensitivity[] = ['high', 'raised', 'general'];
const SEVERITY: Record<Decision, number> = {
  keep: 0,
  lighten: 1,
  essential: 1,
  move: 2,
  indoors: 3,
};

function decide(level: Band, sensitivity: Sensitivity, intensity: Intensity, essential: boolean) {
  const facts: GridFacts = { level, sensitivity, intensity, essential };
  const rule = firstMatch(GRID, facts);
  if (!rule) throw new Error(`No rule for ${JSON.stringify(facts)}`);
  return rule;
}

const CELLS = BANDS.flatMap((level) =>
  SENSITIVITIES.flatMap((sensitivity) =>
    INTENSITIES.map((intensity, i) => ({
      level,
      sensitivity,
      intensity,
      expected: EXPECTED[level][sensitivity][i] ?? 'keep',
    })),
  ),
);

describe('the decision grid', () => {
  it.each(CELLS)(
    '$level, $sensitivity, $intensity gives $expected',
    ({ level, sensitivity, intensity, expected }) => {
      expect(decide(level, sensitivity, intensity, false).then.decision).toBe(expected);
    },
  );

  it.each(CELLS)(
    'an essential trip at $level, $sensitivity, $intensity is protected whenever the grid would change it',
    ({ level, sensitivity, intensity, expected }) => {
      const decision = decide(level, sensitivity, intensity, true).then.decision;
      expect(decision).toBe(expected === 'keep' ? 'keep' : 'essential');
    },
  );

  it('never lets a worse level, a more sensitive person or harder effort get milder advice', () => {
    for (const sensitivity of SENSITIVITIES) {
      for (const intensity of INTENSITIES) {
        const byLevel = BANDS.map(
          (l) => SEVERITY[decide(l, sensitivity, intensity, false).then.decision],
        );
        expect(byLevel).toEqual([...byLevel].sort((a, b) => a - b));
      }
    }
    for (const level of BANDS) {
      for (const intensity of INTENSITIES) {
        const bySensitivity = [...SENSITIVITIES]
          .reverse()
          .map((s) => SEVERITY[decide(level, s, intensity, false).then.decision]);
        expect(bySensitivity).toEqual([...bySensitivity].sort((a, b) => a - b));
      }
      for (const sensitivity of SENSITIVITIES) {
        const byIntensity = INTENSITIES.map(
          (i) => SEVERITY[decide(level, sensitivity, i, false).then.decision],
        );
        expect(byIntensity).toEqual([...byIntensity].sort((a, b) => a - b));
      }
    }
  });

  it('gives every move a fallback that is indoors or lighten, and gives no essential rule a move', () => {
    for (const rule of GRID) {
      if (rule.then.decision === 'move') {
        expect(['indoors', 'lighten']).toContain(rule.then.fallback);
        expect(rule.when.essential ?? []).not.toContain(true);
      }
      if (rule.when.essential?.includes(true)) expect(rule.then.decision).toBe('essential');
    }
    expect(Object.keys(NO_WINDOW).sort()).toEqual(['indoors', 'lighten']);
  });
});

describe('rule data', () => {
  const rows = [
    ...GRID.map((r) => [r.id, r.source] as const),
    ...TOP_ACTIONS.map((r) => [r.id, r.source] as const),
    ...PROTECTION.map((r) => [r.id, r.source] as const),
    ...Object.entries(RULE_SOURCES),
    ['inhalation', INHALATION.source] as const,
    ...INHALATION.rows.map((r) => ['inhalation ' + r.years, r.source] as const),
    ...Object.entries(INHALATION.ageBands).map(
      ([band, m]) => ['inhalation for ' + band, m.source] as const,
    ),
  ];

  it.each(rows)('%s carries a complete source', (_id, source) => {
    expect(source.id).not.toBe('');
    // A Saans rule is not a government statement, so it links to none.
    if (source.status === 'APP') expect(source.url).toBe('');
    else expect(source.url).toMatch(/^https:\/\//);
    if (source.status === 'P-READ') expect(source.quote?.length).toBeGreaterThan(0);
    // A secondary fetch is paraphrase, so it never claims verbatim words.
    if (source.status === 'P-FETCH') expect(source.quote).toBeUndefined();
    if (source.status === 'APP') expect(source.title).toMatch(/^Saans rule:/);
  });

  it('keeps every rule text plain: no dashes, no "safe", no placeholders left over', () => {
    const texts = [
      ...GRID.map((r) => r.then.text),
      ...TOP_ACTIONS.map((r) => r.then),
      ...PROTECTION.flatMap((r) => [...r.lines]),
      ...Object.values(NO_WINDOW),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(DASHES);
      expect(text).not.toMatch(/\bsafe/i);
      expect(text.replaceAll(/\{(level|when|best|weekdays)\}/g, '')).not.toMatch(/[{}]/);
    }
  });

  it('never gives a child an N95 instruction', () => {
    const small = PROTECTION.filter((r) =>
      r.ages.some((a) => ['infant', 'under5', 'child'].includes(a)),
    );
    expect(small.length).toBeGreaterThan(0);
    for (const row of small) {
      // A row that serves a small child never serves an adult and never mentions an N95.
      expect(row.ages.includes('adult')).toBe(row.id === 'car');
      for (const line of row.lines) expect(line).not.toMatch(/N95/i);
    }
  });
});

describe('rows changed after review', () => {
  it('sends a child or teenager who cannot be moved at Poor indoors, not to a shorter game', () => {
    const rule = decide('poor', 'raised', 'vigorous', false);
    expect(rule.then.decision).toBe('move');
    expect(rule.then.fallback).toBe('indoors');
    expect(decide('poor', 'raised', 'light', false).then.text).toContain(
      'Keep time outdoors short; breaks are better indoors.',
    );
  });

  it('gives children at Moderate the CPCB wording and a way to ease off', () => {
    const rule = decide('moderate', 'raised', 'light', false);
    expect(rule.id).toBe('keep-moderate-raised');
    expect(rule.then.decision).toBe('keep');
    expect(rule.then.text).toContain('can cause breathing discomfort to children');
    expect(rule.then.text).toContain('ease off if there is coughing or breathing trouble');
    expect(rule.then.text).not.toContain('No change is needed');
    expect(decide('moderate', 'general', 'light', false).id).toBe('keep-moderate');
  });

  it('does not cite the Stage IV charter for the Severe band, and names MoHFW instead', () => {
    expect(Object.keys(RULE_SOURCES)).not.toContain('grap-iv-charter');
    for (const sensitivity of SENSITIVITIES) {
      for (const essential of [false, true]) {
        const rule = decide('severe', sensitivity, 'light', essential);
        expect(rule.source.id, rule.id).not.toMatch(/stage-iv|charter/);
      }
    }
    expect(decide('severe', 'high', 'light', false).source.id).toBe('mohfw-advisory-2025');
  });

  it('limits the very poor advice to what the source says', () => {
    expect(decide('very_poor', 'general', 'vigorous', false).then.text).toContain(
      'in the morning and late evening',
    );
    expect(decide('very_poor', 'raised', 'light', false).then.text).toContain(
      'a long time outdoors can cause respiratory illness',
    );
  });

  it('words the mask lines as something to consider, and quotes the MoHFW sentence', () => {
    for (const row of PROTECTION.filter((r) => r.lines.some((l) => l.includes('N95')))) {
      expect(row.source.quote, row.id).toContain('These masks may help');
      for (const line of row.lines) expect(line, row.id).not.toMatch(/^Wear\b/);
    }
    const masks = PROTECTION.filter((r) => r.lines.some((l) => l.includes('N95')));
    expect(masks.length).toBeGreaterThan(0);
    for (const row of masks) {
      // Mask lines appear only at Poor or worse.
      expect(row.levels, row.id).toEqual(['poor', 'very_poor', 'severe']);
    }
  });

  it('keeps the poor day guard texts plain and fully filled', () => {
    for (const text of [POOR_DAY.moveText, POOR_DAY.lightNote]) {
      expect(text).not.toMatch(DASHES);
      expect(text).not.toMatch(/\bsafe/i);
      expect(text.replaceAll(/\{(level|from|to)\}/g, '')).not.toMatch(/[{}]/);
    }
    expect(POOR_DAY.adviceSource.status).toBe('P-READ');
  });
});
