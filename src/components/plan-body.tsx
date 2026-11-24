import type { ReactElement, ReactNode } from 'react';

import type { RoutineAdvice } from '@/core/plan/types';
import type { WrittenText } from '@/server/genai';
import type { PlanView } from '@/server/plan-view';

import { AlternativesSection, GrapSection, HomeSection, MoreSection } from './advice-lists';
import { AirSection } from './air-section';
import { DayRibbon } from './day-ribbon';
import type { PlanContext } from './links';
import { GlanceSection, MemberSummaries, SevereBanner, Timeline } from './plan-day';
import {
  AnswerCard,
  AskSection,
  BriefingSection,
  JumpBar,
  PlanHeader,
  StatusLine,
} from './plan-top';

export interface PlanBodyProps {
  view: PlanView;
  /** Left out when there is no air data to write about. */
  briefing?: WrittenText | undefined;
  ctx: PlanContext;
  /** A fixed line announced after an action. */
  status?: string | undefined;
  /** The routine as it was before a what-if. */
  before?: RoutineAdvice | undefined;
  communityHref: string;
  editHref: string;
  /** True when the page's address carries the family's profile. */
  shareable: boolean;
  /** Shown under the header, such as how a sample household was described. */
  intro?: ReactNode;
}

/** Every section of a plan, in reading order. Sample pages and shared links render the same body. */
export function PlanBody(props: PlanBodyProps): ReactElement {
  const { view, briefing, ctx, status, before, intro } = props;
  const { plan } = view;
  const smogDay = view.mode === 'smog-day';
  const noAir = view.unavailable !== undefined;
  const keep = { day: plan.day.relative, ...(smogDay ? { air: 'smog-day' } : {}) };
  const markers = plan.routines
    .filter((r) => r.scheduled)
    .map((r) => ({ label: `${r.memberLabel} ${r.start}`, start: r.start }));

  return (
    <>
      <PlanHeader plan={plan} ctx={ctx} smogDay={smogDay} />
      <StatusLine text={status} />
      <JumpBar
        hasAnswer={plan.answer !== undefined}
        hasBriefing={!noAir && briefing !== undefined}
      />
      {plan.answer === undefined ? null : (
        <AnswerCard answer={plan.answer} question={view.household.question} />
      )}
      {intro}
      {noAir || briefing === undefined ? null : (
        <BriefingSection
          briefing={briefing}
          action={`${ctx.actionBase}/explain`}
          formToken={ctx.formToken}
          keep={keep}
        />
      )}
      <AirSection air={plan.air} smogDay={smogDay} unavailable={view.unavailable !== undefined} />
      {noAir ? null : (
        <>
          <section id="hours" aria-labelledby="hours-title" className="section">
            <h2 id="hours-title">Hour by hour</h2>
            <DayRibbon
              hourly={plan.air.hourly}
              dayLabel={plan.day.label}
              markers={markers}
              window={plan.glance.best}
            />
          </section>
          <GlanceSection glance={plan.glance} />
          {plan.severe ? <SevereBanner scoped={plan.glance.activeStays} /> : null}
        </>
      )}
      <Timeline
        plan={plan}
        before={before}
        noAir={noAir}
        whatIf={{ action: `${ctx.actionBase}/whatif`, formToken: ctx.formToken, keep }}
      />
      {noAir ? null : <MemberSummaries members={plan.members} />}
      {noAir ? null : (
        <AskSection action={`${ctx.actionBase}/ask`} formToken={ctx.formToken} keep={keep} />
      )}
      <HomeSection home={view.home} />
      <AlternativesSection alternatives={view.alternatives} transit={view.transit} />
      <GrapSection grap={view.grap} />
      <MoreSection
        ctx={ctx}
        communityHref={props.communityHref}
        editHref={props.editHref}
        shareable={props.shareable}
        smogDay={smogDay}
      />
    </>
  );
}
