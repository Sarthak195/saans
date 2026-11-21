import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { sampleById } from '@/core/profile/samples';
import { CommunityPage } from '@/server/community-page';
import type { SearchParams } from '@/server/query';
import { householdOfSample } from '@/server/sample';
import { sealHousehold } from '@/server/seal';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sample = sampleById((await params).id);
  return { title: sample === undefined ? 'Sample not found' : `Community view: ${sample.title}` };
}

export default async function CommunitySamplePage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { id } = await params;
  const sample = sampleById(id);
  if (sample === undefined) notFound();
  const household = householdOfSample(sample);
  return CommunityPage({
    household,
    // Forms on a sample page change a copy, so they post to its sealed household.
    token: sealHousehold(household),
    base: `/plan/sample/${id}/community`,
    planHref: `/plan/sample/${id}`,
    searchParams: await searchParams,
  });
}
