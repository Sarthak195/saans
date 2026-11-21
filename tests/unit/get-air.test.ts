import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAirSeries } from '@/server/air/get-air';
import { AppError } from '@/server/errors';

import { airBody, jsonResponse } from '../helpers/air-body';

const NOW = new Date('2026-11-21T16:35:00Z');
const now = (): Date => NOW;

afterEach(() => vi.restoreAllMocks());

describe('getAirSeries', () => {
  it('returns live data when the source answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(airBody())));
    const series = await getAirSeries(28.6, 77.2, { now });
    expect(series.source).toBe('open-meteo-cams');
    expect(series.recordedOn).toBeUndefined();
  });

  it('falls back to the dated recording for a sample place when the source is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const series = await getAirSeries(19.13, 72.85, { now });
    expect(series.source).toBe('recorded');
    expect(series.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the recording on a bad shape as well', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hourly: {} })));
    expect((await getAirSeries(28.6, 77.3, { now })).source).toBe('recorded');
  });

  it('throws upstream_unavailable for any other place, keeping the cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('slow', 'TimeoutError')));
    const error = await getAirSeries(26.9, 75.8, { now }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('upstream_unavailable');
    expect(((error as AppError).cause as AppError).kind).toBe('upstream_timeout');
  });

  it('does not hide a point outside India behind a recording', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const error = await getAirSeries(51.5, -0.1, { now }).catch((e: unknown) => e);
    expect((error as AppError).kind).toBe('outside_india');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
