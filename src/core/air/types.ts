// The shapes of air data: an hour stamp, one hour of readings, a nearby monitor's reading and a
// series of hours for one place. Pure core: types only. The server adapters fill them in and the
// core reads them, and every concentration is in micrograms per cubic metre unless noted.

/** An hour on the Indian wall clock, written 'YYYY-MM-DDTHH:00'. India has one zone (+05:30) and no DST. */
export type HourStamp = string;

/** One hour of air data. Every value is a concentration in ug/m3 exactly as the source delivered it. */
export interface HourSample {
  hour: HourStamp;
  /** Fine particles (PM2.5), or null when the source had no value for this hour. */
  pm25: number | null;
  /** Coarser particles (PM10), or null when the source had no value for this hour. */
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
  /** The station's name as the provider gives it. */
  name: string;
  /** How far the station is from the place, in km. */
  distanceKm: number;
  pm25: number | null;
  pm10: number | null;
  /** ISO 8601 with offset. */
  measuredAt: string;
}

/** Hourly air data for one place: the past 24 hours and the forecast ahead, oldest first. */
export interface AirSeries {
  /** Live model data, or a dated recording (see `recordedOn`) in its place. */
  source: 'open-meteo-cams' | 'recorded';
  /** Latitude and longitude of the model grid point the data describes, in degrees. */
  gridLat: number;
  gridLon: number;
  hours: HourSample[];
  /** ISO 8601 with +05:30. */
  fetchedAt: string;
  /** Set when the series is a dated recording rather than live data, as 'YYYY-MM-DD'. */
  recordedOn?: string;
  /** A nearby monitor's reading, when one was found. It sits beside the hours, never in them. */
  station?: StationReading;
}
