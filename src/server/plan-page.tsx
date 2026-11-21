import 'server-only';

import type { ReactElement, ReactNode } from 'react';

import { ErrorNotice, AlertNotice } from '@/components/notice';
import { noteLine, statusLine } from '@/components/copy';
import { PlanBody } from '@/components/plan-body';
import type { RoutineAdvice } from '@/core/plan/types';
import type { PlanDay } from '@/core/time';
import { templateBriefing } from '@/core/briefing';
import type { Household } from '@/core/types';
import { AppError, userMessage } from '@/server/errors';
import { issueFormToken } from '@/server/guards';
import { airOf, dayOf, readPlanQuery } from '@/server/query';
import type { SearchParams } from '@/server/query';
import { loadPlanView } from '@/server/plan-view';
import type { AirMode, PlanView } from '@/server/plan-view';
import { autoBriefing } from '@/server/auto-briefing';
import { openHousehold } from '@/server/seal';
import { openWritten } from '@/server/written-draft';

export interface PlanPageProps {
  household: Household;
  /** The page's own path. */
  base: string;
  /** The sealed household that forms on this page post to. */
  token: string;
  searchParams: SearchParams;
  /** True when the page address carries the family's profile. */
  shareable: boolean;
  communityHref: string;
  intro?: ReactNode;
}

/** The routine as an earlier version of the household planned it, so the page can show before and after. */
async function routineBefore(
  fromToken: string | undefined,
  routineId: string | undefined,
  now: Date,
  day: PlanDay['relative'] | undefined,
  air: AirMode | undefined,
): Promise<RoutineAdvice | undefined> {
  if (fromToken === undefined || routineId === undefined) return undefined;
  try {
    const earlier = await loadPlanView({ household: openHousehold(fromToken), now, day, air });
    return earlier.plan.routines.find((r) => r.routineId === routineId);
  } catch (error) {
    // The comparison is a courtesy: a stale or bad link just leaves the line out.
    if (error instanceof AppError) return undefined;
    throw error;
  }
}

function joinStatus(...parts: (string | undefined)[]): string | undefined {
  const text = parts.filter((p) => p !== undefined && p !== '').join(' ');
  return text === '' ? undefined : text;
}

/** One plan, from a household: used for a shared link and for a sample, which differ only in the address. */
export async function PlanPage(props: PlanPageProps): Promise<ReactElement> {
  const q = readPlanQuery(props.searchParams);
  const now = new Date();
  const day = dayOf(q.day);
  const air: AirMode | undefined = airOf(q.air);

  let view: PlanView;
  try {
    view = await loadPlanView({ household: props.household, now, day, air });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <ErrorNotice
        text={userMessage(error.kind)}
        links={[
          { href: '/', label: 'Go to the home page' },
          { href: props.base, label: 'Try again' },
        ]}
      />
    );
  }

  // A sealed summary from the explain step wins. Otherwise the page asks Gemini for the English
  // summary and waits only a moment, so the code-built one is always ready as the fallback.
  const sealed =
    view.unavailable === undefined
      ? openWritten(q.b, {
          token: props.token,
          view,
          lang: q.lang === 'hi' ? 'hi' : 'en',
          audience: 'family',
          now,
        })
      : undefined;
  const briefing =
    view.unavailable !== undefined
      ? undefined
      : (sealed ??
        (await autoBriefing(view)) ?? {
          by: 'template' as const,
          text: templateBriefing(view.plan),
          lang: 'en' as const,
        });
  const before = await routineBefore(q.from, q.r, now, day, air);

  return (
    <>
      {view.unavailable === undefined ? null : (
        <AlertNotice
          text={userMessage(view.unavailable)}
          links={[{ href: props.base, label: 'Try again' }]}
        />
      )}
      <PlanBody
        view={view}
        briefing={briefing}
        ctx={{
          base: props.base,
          actionBase: `/plan/${props.token}`,
          formToken: issueFormToken(now),
          keep: { air, lang: q.lang },
        }}
        status={joinStatus(statusLine(q.status), noteLine(q.note))}
        before={before}
        communityHref={props.communityHref}
        editHref={`/household?from=${props.token}`}
        shareable={props.shareable}
        intro={props.intro}
      />
    </>
  );
}
