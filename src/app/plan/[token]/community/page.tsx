import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ErrorNotice } from '@/components/notice';
import { CommunityPage } from '@/server/community-page';
import { AppError, userMessage } from '@/server/errors';
import type { SearchParams } from '@/server/query';
import { openHousehold } from '@/server/seal';

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Community view',
  robots: { index: false, follow: false },
};

export default async function CommunityTokenPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { token } = await params;
  try {
    return await CommunityPage({
      household: openHousehold(token),
      base: `/plan/${token}/community`,
      planHref: `/plan/${token}`,
      searchParams: await searchParams,
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
