// Loads the one-line air reading for Delhi shown at the top of the home page. Server layer (I/O).
// It asks for no input from the visitor and turns every expected failure into "unavailable".
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

/**
 * What the home page strip shows. 'now' is a live reading with the hour its data belongs to,
 * 'recorded' is a saved reading with the date it was recorded, and 'unavailable' is no number.
 */
export type LiveStrip =
  | { kind: 'now'; aqi: number; band: Band; dataHour: HourStamp }
  | { kind: 'recorded'; aqi: number; band: Band; recordedOn: string }
  | { kind: 'unavailable' };

/**
 * Delhi's AQI today with no input from the visitor, labelled as live, as saved, or as missing.
 * The caller passes the current time. Never throws for an expected air data failure.
 */
export async function loadLiveStrip(now: Date): Promise<LiveStrip> {
  try {
    const series = await getAirSeries(DELHI.lat, DELHI.lon, { now: () => now });
    // A recording can stand in when the live service fails. It is read on its own date, so the
    // clock is moved onto that date (keeping the real time of day) before the hour is looked up.
    const recorded = series.source === 'recorded' && series.recordedOn !== undefined;
    const at =
      recorded && series.recordedOn !== undefined ? anchoredTo(now, series.recordedOn) : now;
    // The AQI for the IST hour at that moment; no usable number means no strip.
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
    };
  } catch (error) {
    // A failure the app knows about leaves the strip out. Anything else is a bug and is rethrown.
    if (error instanceof AppError) return { kind: 'unavailable' };
    throw error;
  }
}
