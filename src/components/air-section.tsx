import type { ReactElement } from 'react';

import type { StationReading } from '@/core/air/types';
import { healthStatement } from '@/core/aqi';
import { oneDecimal } from '@/core/format';
import type { AirSummary } from '@/core/plan/types';
import { istParts } from '@/core/time';

import { BandBadge } from './band';
import { CPCB_URL, SAMEER_URL, SMOG_DAY_LABEL } from './copy';
import { clockOf, coordinate, dateLabel, whole } from './format';

const GAS_NAME: Record<string, string> = {
  no2: 'Nitrogen dioxide',
  o3: 'Ozone',
  co: 'Carbon monoxide',
  so2: 'Sulphur dioxide',
};
const GAS_ORDER = ['no2', 'o3', 'co', 'so2'] as const;

function SourceLine({ air }: { readonly air: AirSummary }): ReactElement {
  const grid = `${coordinate(air.gridLat)} N ${coordinate(air.gridLon)} E`;
  return (
    <p className="small">
      Open-Meteo, CAMS global model, grid point {grid}; data hour {clockOf(air.dataHour)} IST;
      fetched {clockOf(air.fetchedAt)} IST
    </p>
  );
}

/** The nearby monitor's latest reading, in words, beside the model number and never part of it. */
function StationLine({ station }: { readonly station: StationReading }): ReactElement | null {
  const readings = [
    station.pm25 === null ? null : `PM2.5 ${whole(station.pm25)}`,
    station.pm10 === null ? null : `PM10 ${whole(station.pm10)}`,
  ].filter((r) => r !== null);
  const measured = new Date(station.measuredAt);
  if (readings.length === 0 || Number.isNaN(measured.getTime())) return null;
  const when = istParts(measured);
  const clock = `${String(when.hour).padStart(2, '0')}:${String(when.minute).padStart(2, '0')}`;
  return (
    <>
      <p>
        Measured nearby: {readings.join(', ')} at {station.name} (via OpenAQ),{' '}
        {String(oneDecimal(station.distanceKm))} km away, at {clock} IST
      </p>
      <p className="small">
        This is a reading from a street monitor, shown beside the model number. It does not change
        the AQI above.
      </p>
    </>
  );
}

function Provenance({
  air,
  smogDay,
}: {
  readonly air: AirSummary;
  readonly smogDay: boolean;
}): ReactElement | null {
  if (smogDay) return <p className="notice notice--recorded">{SMOG_DAY_LABEL}</p>;
  if (air.source === 'recorded' && air.recordedOn !== undefined) {
    return (
      <p className="notice notice--recorded">
        Recorded {dateLabel(air.recordedOn)}, not live. The live air data could not be reached, so
        this plan uses a saved copy.
      </p>
    );
  }
  return null;
}

function GasTable({
  gases,
}: {
  readonly gases: Partial<Record<string, number>>;
}): ReactElement | null {
  const rows = GAS_ORDER.filter((g) => gases[g] !== undefined);
  if (rows.length === 0) return null;
  return (
    <details>
      <summary>Gases in the air</summary>
      <table className="stack">
        <caption>Gas averages, in micrograms per cubic metre</caption>
        <thead>
          <tr>
            <th scope="col">Gas</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g}>
              <th scope="row">{GAS_NAME[g]}</th>
              <td data-label="Average" className="num">
                {String(gases[g])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Nitrogen dioxide and sulphur dioxide are averaged over the same 24 hours as the number
        above. Ozone and carbon monoxide are averaged over the last 8 hours. They are shown for
        information and do not change the headline number.
      </p>
    </details>
  );
}

/** The air today: the 24-hour CPCB number with its band, source and the reasons it can differ from an app. */
export function AirSection({
  air,
  smogDay = false,
  unavailable = false,
}: {
  readonly air: AirSummary;
  readonly smogDay?: boolean;
  /** True when the plan was built with no air data at all. */
  readonly unavailable?: boolean;
}): ReactElement {
  const { aqi } = air;
  return (
    <section aria-labelledby="air-title" id="air" className="section">
      <h2 id="air-title">Air today</h2>
      {unavailable ? null : <Provenance air={air} smogDay={smogDay} />}
      {aqi.kind === 'ok' ? (
        <>
          <p className="aqi-line">
            <span className="aqi-number">{String(aqi.aqi)}</span>
            <BandBadge band={aqi.band} />
          </p>
          <p>{healthStatement(aqi.band).text}</p>
          <p className="small">
            AQI by the CPCB 24-hour method, a model estimate. It is based on{' '}
            {String(aqi.validHours)} hours of data.
          </p>
        </>
      ) : (
        <p>
          {unavailable
            ? 'The air data for this place could not be loaded, so there is no reading to show.'
            : "There are not enough hours of air data to work out today's AQI. The hourly numbers below still guide the plan."}
        </p>
      )}
      {unavailable ? null : <SourceLine air={air} />}
      {unavailable || air.station === undefined ? null : <StationLine station={air.station} />}
      <details>
        <summary>Why this can differ from the Sameer app</summary>
        <p>
          This number comes from a model with a grid about 45 km wide, so it describes a large area
          and not one street. The Sameer app shows readings from a street monitor, which can be much
          higher or lower right where it stands. The model also gives a 24-hour average, while an
          app often shows the reading for this hour.
        </p>
        <p>
          Model estimates often read lower than street monitors in north Indian winters. If your
          local monitor reads worse, trust the worse reading. Check{' '}
          <a href={CPCB_URL} rel="noopener noreferrer">
            the CPCB air quality site
          </a>{' '}
          or{' '}
          <a href={SAMEER_URL} rel="noopener noreferrer">
            the Sameer app page
          </a>
          .
        </p>
      </details>
      {aqi.kind === 'ok' ? <GasTable gases={aqi.gases} /> : null}
    </section>
  );
}
