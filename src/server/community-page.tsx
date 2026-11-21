import 'server-only';

import type { ReactElement } from 'react';

import { CommunityView } from '@/components/community-view';
import { ErrorNotice } from '@/components/notice';
import { templateNotice } from '@/core/briefing';
import type { Household, Language } from '@/core/types';
import { AppError, userMessage } from '@/server/errors';
import { communityKindOf, withCommunityKind } from '@/server/edits';
import { issueFormToken } from '@/server/guards';
import { settle } from '@/server/http';
import { loadPlanView } from '@/server/plan-view';
import { airOf, first } from '@/server/query';
import type { SearchParams } from '@/server/query';
import { openWritten } from '@/server/written-draft';

export interface CommunityPageProps {
  household: Household;
  /** The page's own path. */
  base: string;
  /** The plan page it belongs to. */
  planHref: string;
  /** The sealed household that the notice form posts to. */
  token: string;
  searchParams: SearchParams;
}

/** The view for a society, school or office, planned for the same household and day as its plan. */
export async function CommunityPage(props: CommunityPageProps): Promise<ReactElement> {
  const { household } = props;
  const kind = communityKindOf(
    first(props.searchParams, 'kind'),
    household.community?.kind ?? 'society',
  );
  const air = airOf(first(props.searchParams, 'air'));
  const lang: Language = first(props.searchParams, 'lang') === 'hi' ? 'hi' : household.lang;
  const now = new Date();

  // A page view never calls the model (the free allowance is tiny): the notice is built in code
  // unless a sealed one from the notice step rides along in the address.
  const loaded = await settle(async () => {
    const view = await loadPlanView({ household: withCommunityKind(household, kind), now, air });
    const { community } = view;
    if (community === undefined) throw new Error('The community view was not built');
    return { view, community };
  });
  if (loaded instanceof AppError) {
    return (
      <ErrorNotice
        text={userMessage(loaded.kind)}
        links={[
          { href: '/', label: 'Go to the home page' },
          { href: props.base, label: 'Try again' },
        ]}
      />
    );
  }

  const written = openWritten(first(props.searchParams, 'n'), {
    token: props.token,
    view: loaded.view,
    lang: first(props.searchParams, 'lang') === 'hi' ? 'hi' : 'en',
    audience: kind,
    now,
  });
  return (
    <CommunityView
      plan={loaded.view.plan}
      community={loaded.community}
      base={props.base}
      planHref={props.planHref}
      notice={
        written ?? {
          by: 'template',
          text: templateNotice(loaded.view.plan, loaded.community),
          lang: 'en',
        }
      }
      writeForm={
        written === undefined && loaded.view.unavailable === undefined
          ? {
              action: `/plan/${props.token}/community/notice`,
              formToken: issueFormToken(now),
              kind,
              lang,
              air,
            }
          : undefined
      }
      smogDay={loaded.view.mode === 'smog-day'}
    />
  );
}
