import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ErrorNotice } from '@/components/notice';
import { AppError, userMessage } from '@/server/errors';
import { PlanPage } from '@/server/plan-page';
import type { SearchParams } from '@/server/query';
import { openHousehold } from '@/server/seal';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

// A shared link holds a family's profile, so it is kept out of search results.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    return {
      title: `Air plan for ${openHousehold(token).place.name}`,
      robots: { index: false, follow: false },
    };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { title: 'This link is not valid', robots: { index: false } };
  }
}

export default async function PlanTokenPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { token } = await params;
  try {
    const household = openHousehold(token);
    return await PlanPage({
      household,
      base: `/plan/${token}`,
      token,
      searchParams: await searchParams,
      shareable: true,
      communityHref: `/plan/${token}/community`,
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <ErrorNotice
        text={userMessage(error.kind)}
        links={[{ href: '/household', label: 'Set up your family' }]}
      />
    );
  }
}
