import { describe, expect, it, vi } from 'vitest';

import { sampleById } from '@/core/profile/samples';
import { loadPlanView } from '@/server/plan-view';

import { airBody, jsonResponse } from '../helpers/air-body';

// 21:30 IST, after the point where a plan opens on tomorrow.
const EVENING = new Date('2026-11-21T21:30:00+05:30');

function sample(id: string): NonNullable<ReturnType<typeof sampleById>> {
  const found = sampleById(id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
}

describe('loadPlanView with live air data', () => {
  it('plans tomorrow in the evening and reports the live source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(airBody())));
    const view = await loadPlanView({ household: sample('s1').household, now: EVENING });
    expect(view.plan.air.source).toBe('open-meteo-cams');
    expect(view.plan.day.date).toBe('2026-11-22');
    expect(view.mode).toBe('live');
    expect(view.plan.routines.length).toBeGreaterThan(0);
    expect(view.community).toBeUndefined();
    expect(view.facts.length).toBeGreaterThan(0);
  });

  it('honours the requested day', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(airBody())));
    const view = await loadPlanView({
      household: sample('s1').household,
      now: EVENING,
      day: 'day_after',
    });
    expect(view.plan.day.relative).toBe('day_after');
  });

  it('builds the community view for a household that has one, or when asked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(airBody())));
    const school = await loadPlanView({ household: sample('s6').household, now: EVENING });
    expect(school.community?.actions.length).toBeGreaterThan(0);
    const forced = await loadPlanView({
      household: sample('s1').household,
      now: EVENING,
      withCommunity: true,
    });
    expect(forced.community).toBeDefined();
  });
});

describe('loadPlanView with recorded air data', () => {
  it('falls back to the recording of a sample place and reads it on its own date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const view = await loadPlanView({ household: sample('s1').household, now: EVENING });
    expect(view.plan.air.source).toBe('recorded');
    expect(view.plan.air.recordedOn).toBe('2026-11-21');
    expect(view.plan.day.date).toBe('2026-11-22');
    expect(view.plan.air.hourly.some((h) => h.pm25 !== null)).toBe(true);
  });

  it('reads the recorded smog day as Delhi on 13 Dec 2025 without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = await loadPlanView({
      household: sample('s3').household,
      now: EVENING,
      air: 'smog-day',
      day: 'tomorrow',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.mode).toBe('smog-day');
    expect(view.plan.air.recordedOn).toBe('2025-12-13');
    expect(view.plan.day.date).toBe('2025-12-13');
    expect(view.plan.day.relative).toBe('today');
    expect(view.plan.place.name).toBe('Delhi');
    expect(view.plan.air.aqi.kind).toBe('ok');
    expect(view.plan.air.hourly.some((h) => h.pm25 !== null)).toBe(true);
  });

  it('keeps the smog day on its date at other times of day', async () => {
    const view = await loadPlanView({
      household: sample('s1').household,
      now: new Date('2026-11-21T07:10:00+05:30'),
      air: 'smog-day',
    });
    expect(view.plan.day.date).toBe('2025-12-13');
  });
});
