import 'server-only';

import type { HourStamp } from '@/core/air/types';
import { aqiToday } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import { istParts } from '@/core/time';
import { getAirSeries } from '@/server/air/get-air';
import { AppError } from '@/server/errors';
import { anchoredTo } from '@/server/plan-view';

// The strip on the home page speaks for Delhi, where the air is most often the news.
const DELHI = { lat: 28.6, lon: 77.2 } as const;

export type LiveStrip =
  | { kind: 'now'; aqi: number; band: Band; dataHour: HourStamp; staleSince?: string }
  | { kind: 'recorded'; aqi: number; band: Band; recordedOn: string }
  | { kind: 'unavailable' };

/** Delhi's AQI today with no input from the visitor, labelled as live, as saved, or as missing. */
export async function loadLiveStrip(now: Date): Promise<LiveStrip> {
  try {
    const series = await getAirSeries(DELHI.lat, DELHI.lon);
    const recorded = series.source === 'recorded' && series.recordedOn !== undefined;
    const at =
      recorded && series.recordedOn !== undefined ? anchoredTo(now, series.recordedOn) : now;
    const aqi = aqiToday(series, istParts(at).hourStamp);
    if (aqi.kind !== 'ok') return { kind: 'unavailable' };
    if (recorded && series.recordedOn !== undefined) {
      return { kind: 'recorded', aqi: aqi.aqi, band: aqi.band, recordedOn: series.recordedOn };
    }
    return {
      kind: 'now',
      aqi: aqi.aqi,
      band: aqi.band,
      dataHour: aqi.windowEnd,
      ...(series.stale === undefined ? {} : { staleSince: series.stale.lastGoodAt }),
    };
  } catch (error) {
    if (error instanceof AppError) return { kind: 'unavailable' };
    throw error;
  }
}
