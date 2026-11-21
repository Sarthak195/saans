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

interface Props {
  params: Promise<{ draft: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Choose your place',
  robots: { index: false, follow: false },
};

const TOKEN_CHARS = /^[A-Za-z0-9_-]{1,2000}$/;

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
  const day = first(query, 'day');
  const air = first(query, 'air');
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
