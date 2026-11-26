// The community view (a society, school or office) for a shared link.
// Layer: route (src/app). It opens the sealed token and hands the household to the shared
// community page; a bad link gets a friendly notice and other errors reach the error page.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ErrorNotice } from '@/components/notice';
import { CommunityPage } from '@/server/community-page';
import { AppError, userMessage } from '@/server/errors';
import type { SearchParams } from '@/server/query';
import { openHousehold } from '@/server/seal';

/** The sealed token from the address, and the query values (kind, air mode, language, notice). */
interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

/** Page title for the community view. Kept out of search results: the link holds a profile. */
export const metadata: Metadata = {
  title: 'Community view',
  robots: { index: false, follow: false },
};

/** Shows the community view for the household in the address, or a notice to set one up. */
export default async function CommunityTokenPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { token } = await params;
  try {
    // The page is awaited here so that an AppError raised while it loads is caught below.
    return await CommunityPage({
      household: openHousehold(token),
      base: `/plan/${token}/community`,
      planHref: `/plan/${token}`,
      token,
      searchParams: await searchParams,
    });
  } catch (error) {
    // Only known, user-facing failures become a notice; anything else is a real fault.
    if (!(error instanceof AppError)) throw error;
    return (
      <ErrorNotice
        text={userMessage(error.kind)}
        links={[{ href: '/household', label: 'Set up your family' }]}
      />
    );
  }
}
