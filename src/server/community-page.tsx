// The page for a society, school or office: the same household and day as its plan, shown as a
// notice the community can copy and send. Server layer: it loads the plan view, checks any
// sealed written notice, and hands plain data to the CommunityView component.
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

/** What a route hands the community page: the household, the page's links, and the query. */
export interface CommunityPageProps {
  /** The household whose plan the notice is written for. */
  household: Household;
  /** The page's own path. */
  base: string;
  /** The plan page it belongs to. */
  planHref: string;
  /** The sealed household that the notice form posts to. */
  token: string;
  /** The address's query values: kind, air, lang and a sealed notice (n). */
  searchParams: SearchParams;
}

/**
 * The view for a society, school or office, planned for the same household and day as its
 * plan.
 */
export async function CommunityPage(props: CommunityPageProps): Promise<ReactElement> {
  const { household } = props;
  // The address may name another kind of community; otherwise the household's own, then a society.
  const kind = communityKindOf(
    first(props.searchParams, 'kind'),
    household.community?.kind ?? 'society',
  );
  // Only the name 'smog-day' selects the recording; every other value means live air.
  const air = airOf(first(props.searchParams, 'air'));
  // The language the notice form will ask for: Hindi if the address says so, else the household's.
  const lang: Language = first(props.searchParams, 'lang') === 'hi' ? 'hi' : household.lang;
  const now = new Date();

  // A page view never calls the model (the free allowance is tiny): the notice is built in code
  // unless a sealed one from the notice step rides along in the address.
  const loaded = await settle(async () => {
    const view = await loadPlanView({ household: withCommunityKind(household, kind), now, air });
    const { community } = view;
    // The household was given a community kind above, so a missing community is a bug, not input.
    if (community === undefined) throw new Error('The community view was not built');
    return { view, community };
  });
  // A known failure becomes one plain message with a way back, never a broken page.
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

  // Reads the sealed notice back. It comes out as undefined unless it was written for this very
  // household, day, air, language and audience, and still passes the checks against this plan.
  const written = openWritten(first(props.searchParams, 'n'), {
    token: props.token,
    view: loaded.view,
    lang: first(props.searchParams, 'lang') === 'hi' ? 'hi' : 'en',
    audience: kind,
    now,
  });
  // With no usable written notice the page shows the code-built one. The write form is offered
  // only in that case, and only when the plan has air data to write from.
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
