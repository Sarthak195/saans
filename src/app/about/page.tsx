import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import {
  ATTRIBUTION,
  CPCB_URL,
  DISCLAIMER_LINE,
  GEONAMES_URL,
  OPENAQ_URL,
  OPEN_METEO_URL,
} from '@/components/copy';

export const metadata: Metadata = { title: 'About Saans, sources and disclaimer' };

export default function AboutPage(): ReactElement {
  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        About Saans
      </h1>
      <p>
        Saans gives an Indian family a plan for the day when the air is poor: which outdoor routines
        to keep, lighten, move or do indoors, with the reason and its source.
      </p>

      <section aria-labelledby="disclaimer-title" className="section">
        <h2 id="disclaimer-title">Disclaimer</h2>
        <p>{DISCLAIMER_LINE}</p>
        <p>
          Saans follows public guidance from the Central Pollution Control Board (CPCB), the health
          ministry and the Commission for Air Quality Management. It cannot know your own health. If
          anyone in your family has asthma, a heart condition or is pregnant, ask your doctor what
          to do on days like these.
        </p>
      </section>

      <section aria-labelledby="data-title" className="section">
        <h2 id="data-title">Where the numbers come from</h2>
        <ul>
          <li>
            Air quality: forecasts and readings from the CAMS global model, served by{' '}
            <a href={OPEN_METEO_URL} rel="noopener noreferrer">
              Open-Meteo
            </a>
            . The model covers a grid about 45 km wide. It is an estimate, not a street monitor.
          </li>
          <li>
            The AQI headline uses the CPCB method over 24 hours. Official readings are on{' '}
            <a href={CPCB_URL} rel="noopener noreferrer">
              the CPCB air quality site
            </a>
            .
          </li>
          <li>
            Measured nearby: the latest PM2.5 and PM10 from the nearest CPCB or state board monitor
            within 10 km that reported in the last 4 hours, through{' '}
            <a href={OPENAQ_URL} rel="noopener noreferrer">
              OpenAQ
            </a>
            . It usually arrives 2 to 3 hours late and is shown beside the model number, never mixed
            into it.
          </li>
          <li>
            Place names:{' '}
            <a href={GEONAMES_URL} rel="noopener noreferrer">
              GeoNames
            </a>
            .
          </li>
        </ul>
        <p>{ATTRIBUTION}</p>
      </section>

      <section aria-labelledby="privacy-title" className="section">
        <h2 id="privacy-title">Privacy</h2>
        <p>
          Saans stores nothing. Your family&apos;s details travel inside the link to your plan, in a
          form only Saans can read, so anyone you give the link to can see the plan. When you write
          about your family in your own words, the text is sent to Google&apos;s Gemini API to read
          it. On the free tier Google may use it to improve its products, so avoid names and exact
          addresses.
        </p>
      </section>

      <p>
        <a href="/">Back to the home page</a>
      </p>
    </>
  );
}
