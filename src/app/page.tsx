// The home page: a one-line air reading for Delhi, the sample families and the box where a
// family writes about their day. Route layer: it reads the query and the clock, then renders.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { AskForm } from '@/components/ask-form';
import type { AskDefaults } from '@/components/ask-form';
import { LiveStripView } from '@/components/live-strip';
import { SampleList } from '@/components/sample-list';
import { SAMPLES, sampleById } from '@/core/profile/samples';
import { issueFormToken } from '@/server/guards';
import { loadLiveStrip } from '@/server/live-strip';
import { first } from '@/server/query';
import type { SearchParams } from '@/server/query';

/** The page title. */
export const metadata: Metadata = { title: 'Plan your day around the air' };

// The sample whose text the "Use this example" link puts in the box.
const EXAMPLE_ID = 's1';

/** What the box starts with: an example, when the visitor followed the link for one. */
function defaultsFrom(query: SearchParams): AskDefaults {
  // An unknown example id finds no sample, so the box starts empty.
  const sample = sampleById(first(query, 'example') ?? '');
  return { text: sample?.text ?? '', place: '' };
}

/**
 * The front door: the live strip, the samples and the form for a family to describe their day.
 * The strip shows "unavailable" rather than failing the page when air data cannot be had.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  // One reading of the clock, for the live strip and for the form token.
  const now = new Date();
  const [query, strip] = await Promise.all([searchParams, loadLiveStrip(now)]);
  // The example link is offered only when that sample exists and has text.
  const example =
    sampleById(EXAMPLE_ID)?.text === undefined ? undefined : `/?example=${EXAMPLE_ID}`;

  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Plan your day around the air
      </h1>
      <p>
        Saans turns today&apos;s air quality into a plan for your family&apos;s school runs, evening
        play and walks. Saans keeps no copy of your family&apos;s details: they travel, encrypted,
        inside the link to your plan.
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
