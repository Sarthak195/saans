import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { AskForm } from '@/components/ask-form';
import type { AskDefaults } from '@/components/ask-form';
import { LiveStripView } from '@/components/live-strip';
import { SampleList } from '@/components/sample-list';
import { INDIA_LAT, INDIA_LON } from '@/core/profile/schema';
import { SAMPLES, sampleById } from '@/core/profile/samples';
import { nearestStaticPlace } from '@/server/geo/geocode';
import { issueFormToken } from '@/server/guards';
import { loadLiveStrip } from '@/server/live-strip';
import { first } from '@/server/query';
import type { SearchParams } from '@/server/query';

export const metadata: Metadata = { title: 'Plan your day around the air' };

const EXAMPLE_ID = 's1';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** What the box and the place field start with: an example, or the device location the visitor shared. */
function defaultsFrom(query: SearchParams): AskDefaults {
  const sample = sampleById(first(query, 'example') ?? '');
  const defaults: AskDefaults = { text: sample?.text ?? '', place: '' };

  const rawLat = first(query, 'lat');
  const rawLon = first(query, 'lon');
  if (rawLat === undefined || rawLon === undefined) return defaults;
  const lat = round1(Number(rawLat));
  const lon = round1(Number(rawLon));
  const inIndia =
    lat >= INDIA_LAT.min && lat <= INDIA_LAT.max && lon >= INDIA_LON.min && lon <= INDIA_LON.max;
  if (!inIndia) {
    return { ...defaults, locationNote: 'Saans covers India. Type a place in India.' };
  }
  const named = nearestStaticPlace(lat, lon);
  if (named !== null) {
    return {
      ...defaults,
      place: `${named.name}, ${named.admin1}`,
      locationNote: `Using ${named.name}, the nearest place we know to your location.`,
    };
  }
  return {
    ...defaults,
    lat: String(lat),
    lon: String(lon),
    locationNote:
      'Using your location, rounded to about 11 km. You can type a place instead if you prefer.',
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const now = new Date();
  const [query, strip] = await Promise.all([searchParams, loadLiveStrip(now)]);
  const example =
    sampleById(EXAMPLE_ID)?.text === undefined ? undefined : `/?example=${EXAMPLE_ID}`;

  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Plan your day around the air
      </h1>
      <p>
        Saans turns today&apos;s air quality into a plan for your family&apos;s school runs, evening
        play and walks. Nothing about your family is stored.
      </p>
      <LiveStripView strip={strip} />
      <SampleList samples={SAMPLES} />
      <AskForm
        formToken={issueFormToken(now)}
        defaults={defaultsFrom(query)}
        exampleHref={example}
      />
    </>
  );
}
