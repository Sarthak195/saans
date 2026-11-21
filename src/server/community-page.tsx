import 'server-only';

import type { ReactElement } from 'react';

import { CommunityView } from '@/components/community-view';
import { ErrorNotice } from '@/components/notice';
import { COMMUNITY_KINDS } from '@/core/profile/schema';
import type { CommunityKind, Household, Language } from '@/core/types';
import { AppError, userMessage } from '@/server/errors';
import { writeNotice } from '@/server/genai';
import { settle } from '@/server/http';
import { loadPlanView } from '@/server/plan-view';
import type { AirMode } from '@/server/plan-view';
import { first } from '@/server/query';
import type { SearchParams } from '@/server/query';

export interface CommunityPageProps {
  household: Household;
  /** The page's own path. */
  base: string;
  /** The plan page it belongs to. */
  planHref: string;
  searchParams: SearchParams;
}

function kindOf(value: string | undefined, fallback: CommunityKind): CommunityKind {
  return COMMUNITY_KINDS.find((k) => k === value) ?? fallback;
}

/** The view for a society, school or office, planned for the same household and day as its plan. */
export async function CommunityPage(props: CommunityPageProps): Promise<ReactElement> {
  const { household } = props;
  const kind = kindOf(first(props.searchParams, 'kind'), household.community?.kind ?? 'society');
  const air: AirMode | undefined =
    first(props.searchParams, 'air') === 'smog-day' ? 'smog-day' : undefined;
  const lang: Language = first(props.searchParams, 'lang') === 'hi' ? 'hi' : household.lang;
  const forKind: Household = {
    ...household,
    community: { kind, outdoorSlots: household.community?.outdoorSlots ?? [] },
  };

  const loaded = await settle(async () => {
    const view = await loadPlanView({ household: forKind, now: new Date(), air });
    const { community } = view;
    if (community === undefined) throw new Error('The community view was not built');
    const wanted = first(props.searchParams, 'notice') === '1';
    const notice = wanted ? await writeNotice({ plan: view.plan, community, lang }) : undefined;
    return { view, community, notice };
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

  return (
    <CommunityView
      plan={loaded.view.plan}
      community={loaded.community}
      base={props.base}
      planHref={props.planHref}
      notice={loaded.notice}
      smogDay={loaded.view.mode === 'smog-day'}
    />
  );
}
