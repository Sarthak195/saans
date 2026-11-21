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

export const metadata: Metadata = { title: 'Plan your day around the air' };

const EXAMPLE_ID = 's1';

/** What the box starts with: an example, when the visitor followed the link for one. */
function defaultsFrom(query: SearchParams): AskDefaults {
  const sample = sampleById(first(query, 'example') ?? '');
  return { text: sample?.text ?? '', place: '' };
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
