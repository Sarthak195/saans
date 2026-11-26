// The page that asks which of several same-named places a family means. Route layer: it opens
// the sealed list from the address. Each choice posts back to /ask or to the plan being changed.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ChoosePlace } from '@/components/choose-place';
import { ErrorNotice } from '@/components/notice';
import { AppError, userMessage } from '@/server/errors';
import { issueFormToken } from '@/server/guards';
import { settle } from '@/server/http';
import { first } from '@/server/query';
import type { SearchParams } from '@/server/query';
import { openDraft } from '@/server/seal';

// What Next.js passes to the page: the sealed draft from the path and the query values.
interface Props {
  params: Promise<{ draft: string }>;
  searchParams: Promise<SearchParams>;
}

/** The page title; the page is marked so search engines do not index it. */
export const metadata: Metadata = {
  title: 'Choose your place',
  robots: { index: false, follow: false },
};

// A sealed token is URL-safe text (letters, digits, "_" and "-", up to 2000 long, such as
// "Ab3_x-9"). A "for" value that does not match is ignored, so it cannot add to the address.
const TOKEN_CHARS = /^[A-Za-z0-9_-]{1,2000}$/;

/**
 * Lists the places that share a name so the family can pick one. A bad or old draft shows an
 * error with a way back to the home page.
 */
export default async function ChoosePage({ params, searchParams }: Props): Promise<ReactElement> {
  const { draft } = await params;
  const query = await searchParams;
  const opened = await settle(() => openDraft(draft));
  if (opened instanceof AppError) {
    return (
      <ErrorNotice
        text={userMessage(opened.kind)}
        links={[{ href: '/', label: 'Go to the home page' }]}
      />
    );
  }

  // A change of place for an existing plan returns there; a reading of text returns to /ask.
  const planToken = first(query, 'for');
  const target = planToken !== undefined && TOKEN_CHARS.test(planToken) ? planToken : undefined;
  // The day and air choices are handed on, so the plan that follows shows the same view.
  const day = first(query, 'day');
  const air = first(query, 'air');
  // The options come from the sealed draft, so a client cannot name a place of its own.
  return (
    <ChoosePlace
      options={opened.options}
      action={target === undefined ? '/ask' : `/plan/${target}/place`}
      formToken={issueFormToken(new Date())}
      draft={draft}
      text={opened.text}
      keep={{ ...(day === undefined ? {} : { day }), ...(air === undefined ? {} : { air }) }}
    />
  );
}
