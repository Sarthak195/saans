/** An hour on the Indian wall clock, written 'YYYY-MM-DDTHH:00'. India has one zone (+05:30) and no DST. */
export type HourStamp = string;

/** One hour of air data. Every value is a concentration in ug/m3 exactly as the source delivered it. */
export interface HourSample {
  hour: HourStamp;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  /** Delivered in ug/m3; the CPCB breakpoints use mg/m3, so the AQI code divides by 1000. */
  co: number | null;
  so2: number | null;
}

/** The latest reading from a nearby monitoring station, kept beside the model data and never blended into it. */
export interface StationReading {
  provider: 'openaq';
  name: string;
  distanceKm: number;
  pm25: number | null;
  pm10: number | null;
  /** ISO 8601 with offset. */
  measuredAt: string;
}

/** Hourly air data for one place: the past 24 hours and the forecast ahead, oldest first. */
export interface AirSeries {
  source: 'open-meteo-cams' | 'recorded';
  gridLat: number;
  gridLon: number;
  hours: HourSample[];
  /** ISO 8601 with +05:30. */
  fetchedAt: string;
  /** Set when the series is a dated recording rather than live data, as 'YYYY-MM-DD'. */
  recordedOn?: string;
  station?: StationReading;
}
