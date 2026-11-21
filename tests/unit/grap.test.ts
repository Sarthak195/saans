import { describe, expect, it } from 'vitest';

import { GRAP, grapNote } from '@/core/alternatives/grap';

import { DELHI, INSUFFICIENT, MUMBAI, NOIDA, aqiOk } from '../helpers/plan-doubles';

describe('grapNote stages', () => {
  it.each([
    [200, null],
    [201, 1],
    [300, 1],
    [301, 2],
    [400, 2],
    [401, 3],
    [450, 3],
    [451, 4],
    [500, 4],
  ])('at AQI %i the stage is %s', (aqi, stage) => {
    expect(grapNote(DELHI, aqiOk(aqi))?.stage ?? null).toBe(stage);
  });

  it('says what applies at this AQI and never claims the stage in force', () => {
    const note = grapNote(DELHI, aqiOk(320));
    expect(
      note?.text.startsWith('At this AQI the GRAP schedule lists Stage II for Delhi NCR.'),
    ).toBe(true);
    expect(note?.text).toContain('CAQM decides which stage is in force and can act earlier');
    expect(note?.text).toContain('check caqm.nic.in.');
    expect(note?.text).not.toMatch(
      /Stage [IV]+ (measures )?(is|are) (now )?(in force|applied|on)\b/i,
    );
    expect(note?.text).not.toMatch(/\bapply\b|\bapplies\b/i);
    expect(note?.text).toContain('housing societies');
  });

  it('gives each stage one family-relevant line with a quoted source', () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const note = grapNote(DELHI, aqiOk([250, 350, 420, 480][stage - 1] ?? 250));
      expect(note?.stage).toBe(stage);
      // A row keeps its quote only where the exact words are on record; otherwise it is a paraphrase.
      if (note?.source.status === 'P-READ') expect(note.source.quote).toBeTruthy();
      else expect(note?.source.quote).toBeUndefined();
      expect(note?.source.url).toMatch(/^https:/);
    }
  });

  it('applies to the NCR towns as well as Delhi', () => {
    expect(grapNote(NOIDA, aqiOk(350))?.stage).toBe(2);
    const sector62 = { name: 'Sector 62', admin1: 'Uttar Pradesh', lat: 28.6, lon: 77.4 };
    expect(grapNote(sector62, aqiOk(350))?.stage).toBe(2);
  });

  it('is null outside Delhi NCR', () => {
    expect(grapNote(MUMBAI, aqiOk(350))).toBeNull();
  });

  it('is null when there is not enough data for an AQI', () => {
    expect(grapNote(DELHI, INSUFFICIENT)).toBeNull();
  });
});

describe('grap data', () => {
  it('tiles the AQI scale from 201 to 500 without gaps', () => {
    const rows = GRAP.stages;
    expect(rows[0]?.from).toBe(201);
    expect(rows.at(-1)?.to).toBe(500);
    rows.slice(1).forEach((row, i) => {
      expect(row.from).toBe((rows[i]?.to ?? 0) + 1);
    });
  });
});
