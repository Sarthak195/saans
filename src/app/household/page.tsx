// The household form page. Route layer: it opens a sealed draft or an existing plan from the
// address and hands the values to the form. It keeps nothing itself.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { HouseholdForm } from '@/components/household-form';
import { ErrorNotice } from '@/components/notice';
import { AppError, userMessage } from '@/server/errors';
import { issueFormToken } from '@/server/guards';
import { settle } from '@/server/http';
import { valuesOfHousehold } from '@/server/household-values';
import { first } from '@/server/query';
import type { SearchParams } from '@/server/query';
import { openDraft, openHousehold } from '@/server/seal';

/** The page title; the page is marked so search engines do not index it. */
export const metadata: Metadata = {
  title: 'Describe your family with a form',
  robots: { index: false, follow: false },
};

/**
 * The form for describing a family by fields. It starts empty, or filled from a sealed draft
 * (a form sent back, or words that needed more) or from a plan link given as "from", to edit it.
 */
export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const query = await searchParams;
  const from = first(query, 'from');
  const draft = first(query, 'draft');
  // A bad or old link comes back as an error value, which the page shows instead of throwing.
  const opened = await settle(() => {
    const earlier = draft === undefined ? undefined : openDraft(draft);
    return {
      draft: earlier,
      // A draft wins; otherwise the plan being edited; otherwise the form starts empty.
      values: earlier?.values ?? (from === undefined ? {} : valuesOfHousehold(openHousehold(from))),
    };
  });
  if (opened instanceof AppError) {
    return (
      <ErrorNotice
        text={userMessage(opened.kind)}
        links={[{ href: '/household', label: 'Start a new form' }]}
      />
    );
  }

  // The form token proves this page was served recently; the save route checks it.
  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Describe your family
      </h1>
      <p>
        Fill in what you know. Saans keeps no copy: the details travel, encrypted, inside the link
        to your plan.
      </p>
      <HouseholdForm
        state={{ values: opened.values, errors: opened.draft?.errors ?? [] }}
        formToken={issueFormToken(new Date())}
        draftText={opened.draft?.text}
        draftReason={opened.draft?.reason}
      />
    </>
  );
}
