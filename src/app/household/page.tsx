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

export const metadata: Metadata = {
  title: 'Describe your family with a form',
  robots: { index: false, follow: false },
};

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const query = await searchParams;
  const from = first(query, 'from');
  const draft = first(query, 'draft');
  const opened = await settle(() => {
    const earlier = draft === undefined ? undefined : openDraft(draft);
    return {
      draft: earlier,
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

  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Describe your family
      </h1>
      <p>
        Fill in what you know. Saans stores nothing: the details travel inside the link to your
        plan.
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
