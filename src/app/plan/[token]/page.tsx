// The plan page for a shared link: the family's profile is sealed inside the address token.
// Layer: route (src/app). It opens the token and hands the household to the shared plan page.
// A bad link gets a friendly notice; any other error is left to the error page.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ErrorNotice } from '@/components/notice';
import { AppError, userMessage } from '@/server/errors';
import { PlanPage } from '@/server/plan-page';
import type { SearchParams } from '@/server/query';
import { openHousehold } from '@/server/seal';

/** The sealed token from the address, and the query values (day, air mode, language) with it. */
interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * Titles the tab by the family's place, or says the link is not valid if the token will not open.
 * A shared link holds a family's profile, so it is kept out of search results.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    return {
      title: `Air plan for ${openHousehold(token).place.name}`,
      robots: { index: false, follow: false },
    };
  } catch (error) {
    // A token that will not open is an AppError; anything else is a real fault.
    if (!(error instanceof AppError)) throw error;
    return { title: 'This link is not valid', robots: { index: false } };
  }
}

/** Shows the plan for the household in the address, or a notice with a way to set one up. */
export default async function PlanTokenPage({
  params,
  searchParams,
}: Props): Promise<ReactElement> {
  const { token } = await params;
  try {
    const household = openHousehold(token);
    // The page is awaited here so that an AppError raised while it loads is caught below.
    return await PlanPage({
      household,
      base: `/plan/${token}`,
      token,
      searchParams: await searchParams,
      // The address carries the profile, so the page can say so and offer the link for sharing.
      shareable: true,
      communityHref: `/plan/${token}/community`,
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    // The text comes from the error kind, never from the error's own message.
    return (
      <ErrorNotice
        text={userMessage(error.kind)}
        links={[{ href: '/household', label: 'Set up your family' }]}
      />
    );
  }
}
