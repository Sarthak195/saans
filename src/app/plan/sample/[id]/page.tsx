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

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sample = sampleById((await params).id);
  return { title: sample === undefined ? 'Sample not found' : `Sample: ${sample.title}` };
}

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
    shareable: false,
    communityHref: `/plan/sample/${id}/community`,
    intro: <SampleIntro text={sample.text} formToken={issueFormToken(new Date())} />,
  });
}
