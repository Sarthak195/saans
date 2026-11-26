// The plan page for a built-in sample family, at a stable address that holds no profile.
// Layer: route (src/app). It looks the sample up by id and renders the same plan page as a
// shared link, with an introduction on top and no share option.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { SampleIntro } from '@/components/sample-intro';
import { sampleById } from '@/core/profile/samples';
import { issueFormToken } from '@/server/guards';
import { PlanPage } from '@/server/plan-page';
import type { SearchParams } from '@/server/query';
import { householdOfSample } from '@/server/sample';
import { sealHousehold } from '@/server/seal';

/** The sample id from the address, and the query values (day, air mode, language) with it. */
interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

/** Titles the tab by the sample, or says it was not found for an unknown id. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sample = sampleById((await params).id);
  return { title: sample === undefined ? 'Sample not found' : `Sample: ${sample.title}` };
}

/** Shows the plan for one sample household; an unknown id gives the not-found page. */
export default async function SamplePlanPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { id } = await params;
  const sample = sampleById(id);
  if (sample === undefined) notFound();
  const household = householdOfSample(sample);
  return PlanPage({
    household,
    base: `/plan/sample/${id}`,
    // Forms on a sample page change a copy, so they need a link to the household; the page
    // itself stays at its stable address.
    token: sealHousehold(household),
    searchParams: await searchParams,
    // The address holds no profile, so there is nothing private to share.
    shareable: false,
    communityHref: `/plan/sample/${id}/community`,
    intro: <SampleIntro text={sample.text} formToken={issueFormToken(new Date())} />,
  });
}
