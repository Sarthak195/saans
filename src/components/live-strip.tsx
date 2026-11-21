import type { ReactElement } from 'react';

import type { LiveStrip } from '@/server/live-strip';

import { BandBadge } from './band';
import { clockOf, dateLabel } from './format';

/** Delhi's air today, in one place that needs no input from the visitor. */
export function LiveStripView({ strip }: { readonly strip: LiveStrip }): ReactElement {
  return (
    <section className="live-strip" aria-labelledby="live-title">
      {strip.kind === 'now' ? (
        <h2 id="live-title" className="aqi-line">
          Delhi now: AQI {String(strip.aqi)}, <BandBadge band={strip.band} />
        </h2>
      ) : (
        <h2 id="live-title">Delhi&apos;s air</h2>
      )}
      {strip.kind === 'unavailable' ? (
        <p>
          The live air data for Delhi is not reachable right now. Try again in a few minutes, or
          open a sample plan below.
        </p>
      ) : strip.kind === 'recorded' ? (
        <>
          <p>
            The live air data for Delhi is not reachable right now. The last saved reading is from{' '}
            {dateLabel(strip.recordedOn)} and is not live.
          </p>
          <p className="aqi-line">
            AQI {String(strip.aqi)}, <BandBadge band={strip.band} />
          </p>
        </>
      ) : (
        <>
          <p className="small">
            CPCB 24-hour method, model estimate. Data hour {clockOf(strip.dataHour)} IST. Open-Meteo
            CAMS.
            {strip.staleSince === undefined
              ? ''
              : ` Last updated ${clockOf(strip.staleSince)} IST; the live source is not reachable right now.`}
          </p>
        </>
      )}
    </section>
  );
}
