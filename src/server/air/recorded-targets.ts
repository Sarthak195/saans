// The places and days that scripts/record-fixtures.ts records, and that the recorded loader
// recognises. Server layer: plain data with no I/O, imported by the script, the loader and the
// plan view.
import type { DateWindow } from '@/server/air/open-meteo-shape';

// One recording to make: where, what to call it, and for a past day the dates to ask for.
interface RecordingTarget {
  /** File name under src/data/recorded, and the id passed to fetchRecordedSeries. */
  id: string;
  lat: number;
  lon: number;
  label: string;
  /** Present for a past day recorded by date range instead of a live snapshot. */
  window?: DateWindow;
  /** The day the recording stands for, when it is not the day it was fetched. */
  recordedOn?: string;
  note?: string;
}

/**
 * The sample places, each recorded on the day the fixtures were last refreshed. Coordinates are
 * at 0.1 degree, the rounding the live request uses; recordedIdForPoint compares a point with
 * them at that rounding.
 */
export const SNAPSHOT_TARGETS: readonly RecordingTarget[] = [
  { id: 'delhi-lajpat-nagar', lat: 28.6, lon: 77.2, label: 'Lajpat Nagar, Delhi' },
  { id: 'mumbai-andheri', lat: 19.1, lon: 72.9, label: 'Andheri, Mumbai' },
  { id: 'kolkata-salt-lake', lat: 22.6, lon: 88.4, label: 'Salt Lake (Bidhannagar), Kolkata' },
  { id: 'bengaluru-indiranagar', lat: 13.0, lon: 77.6, label: 'Indiranagar, Bengaluru' },
  { id: 'noida', lat: 28.6, lon: 77.3, label: 'Noida' },
];

/** The id of the recorded Delhi smog day, also the name of its file under src/data/recorded. */
export const SMOG_DAY_ID = 'delhi-smog-2025-12-13';

/** A real severe day for Delhi, so the plan can be compared against an actual smog day. */
export const SMOG_DAY_TARGET: RecordingTarget = {
  id: SMOG_DAY_ID,
  lat: 28.6,
  lon: 77.2,
  label: 'Delhi smog day',
  // The dates asked for run from the 12th to the 14th; the recording stands for the 13th.
  window: { startDate: '2025-12-12', endDate: '2025-12-14' },
  recordedOn: '2025-12-13',
  note: 'GRAP Stage IV was invoked in Delhi on 2025-12-13.',
};

/** Every recording the script makes: the sample-place snapshots, then the smog day. */
export const RECORDING_TARGETS: readonly RecordingTarget[] = [...SNAPSHOT_TARGETS, SMOG_DAY_TARGET];
