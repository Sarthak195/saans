import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { RECORDED_IDS, fetchRecordedSeries, recordedIdForPoint } from '@/server/air/recorded';
import { airUrl, istIso } from '@/server/air/open-meteo-shape';
import {
  RECORDING_TARGETS,
  SMOG_DAY_ID,
  SMOG_DAY_TARGET,
  SNAPSHOT_TARGETS,
} from '@/server/air/recorded-targets';
import { AppError } from '@/server/errors';
import { STATIC_PLACES } from '@/server/geo/places';

function rawFixture(id: string): { provenance: { url: string; retrievedAt: string } } {
  return JSON.parse(readFileSync(`src/data/recorded/${id}.json`, 'utf8')) as never;
}

describe('recorded fixtures', () => {
  it('has one recording per target and nothing else', () => {
    expect([...RECORDED_IDS].sort()).toEqual(RECORDING_TARGETS.map((t) => t.id).sort());
  });

  it.each(RECORDING_TARGETS.map((t) => [t.id, t] as const))(
    '%s was recorded from the request this app makes',
    (id, target) => {
      const { provenance } = rawFixture(id);
      expect(provenance.url).toBe(airUrl(target.lat, target.lon, target.window));
      expect(provenance.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/);
    },
  );

  it.each(RECORDING_TARGETS.map((t) => t.id))('%s is stored minified', (id) => {
    const text = readFileSync(`src/data/recorded/${id}.json`, 'utf8');
    expect(text.trimEnd()).not.toContain('\n');
    expect(text).not.toContain('  ');
  });
});

describe('fetchRecordedSeries', () => {
  it.each(RECORDED_IDS)(
    'reads %s as a recorded, hour-by-hour series with real values',
    async (id) => {
      const series = await fetchRecordedSeries(id);
      expect(series.source).toBe('recorded');
      expect(series.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(series.fetchedAt).toBe(rawFixture(id).provenance.retrievedAt);

      const stamps = series.hours.map((h) => h.hour);
      expect(stamps.every((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(s))).toBe(true);
      // Ascending with no gaps: each stamp is exactly one hour after the one before.
      stamps.slice(1).forEach((stamp, i) => {
        const gap = Date.parse(`${stamp}:00Z`) - Date.parse(`${stamps[i] ?? ''}:00Z`);
        expect(gap).toBe(3_600_000);
      });
      expect(series.hours.filter((h) => h.pm25 !== null).length).toBeGreaterThan(24);
    },
  );

  it.each(SNAPSHOT_TARGETS.map((t) => t.id))(
    'trims snapshot %s to 24 hours back and 72 ahead of the day it was taken',
    async (id) => {
      const series = await fetchRecordedSeries(id);
      expect(series.recordedOn).toBe(series.fetchedAt.slice(0, 10));
      expect(series.hours).toHaveLength(24 + 72 + 1);
      const taken = new Date(series.fetchedAt);
      expect(series.hours[0]?.hour).toBe(
        istIso(new Date(taken.getTime() - 24 * 3_600_000)).slice(0, 13) + ':00',
      );
    },
  );

  it('keeps all 72 hours of the Delhi smog day and dates it to the day of the GRAP Stage IV order', async () => {
    const series = await fetchRecordedSeries(SMOG_DAY_ID);
    expect(series.recordedOn).toBe('2025-12-13');
    expect(series.hours).toHaveLength(72);
    expect(series.hours[0]?.hour).toBe('2025-12-12T00:00');
    expect(series.hours.at(-1)?.hour).toBe('2025-12-14T23:00');
    const peak = Math.max(...series.hours.map((h) => h.pm25 ?? 0));
    // PM2.5 above 250 ug/m3 is in the CPCB Severe range, so this really is a smog day.
    expect(peak).toBeGreaterThan(250);
    expect(rawFixture(SMOG_DAY_ID)).toMatchObject({
      provenance: { note: expect.stringContaining('GRAP Stage IV') as string },
    });
    expect(SMOG_DAY_TARGET.window).toEqual({ startDate: '2025-12-12', endDate: '2025-12-14' });
  });

  it('rejects an unknown id as no data, including names that are object keys', async () => {
    for (const id of ['mumbai', '', '__proto__', 'constructor', '../places']) {
      const error = await fetchRecordedSeries(id).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).kind).toBe('no_data');
    }
  });
});

describe('recordedIdForPoint', () => {
  it('matches the sample points at 0.1 degree and nothing else', () => {
    expect(recordedIdForPoint(28.6, 77.2)).toBe('delhi-lajpat-nagar');
    expect(recordedIdForPoint(28.62, 77.18)).toBe('delhi-lajpat-nagar');
    expect(recordedIdForPoint(28.6, 77.3)).toBe('noida');
    expect(recordedIdForPoint(19.1, 72.9)).toBe('mumbai-andheri');
    expect(recordedIdForPoint(22.6, 88.4)).toBe('kolkata-salt-lake');
    expect(recordedIdForPoint(13.0, 77.6)).toBe('bengaluru-indiranagar');
    expect(recordedIdForPoint(26.9, 75.8)).toBeUndefined();
  });

  it('never selects the smog day for a live point', () => {
    for (const target of SNAPSHOT_TARGETS) {
      expect(recordedIdForPoint(target.lat, target.lon)).not.toBe(SMOG_DAY_ID);
    }
  });

  it('finds a recording for every sample locality in the place list', () => {
    const samples = ['Lajpat Nagar', 'Andheri', 'Salt Lake (Bidhannagar)', 'Indiranagar', 'Noida'];
    for (const name of samples) {
      const place = STATIC_PLACES.find((p) => p.name === name);
      expect(place, name).toBeDefined();
      expect(recordedIdForPoint(place?.lat ?? 0, place?.lon ?? 0), name).toBeDefined();
    }
  });
});
