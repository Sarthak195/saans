import type { ReactElement, ReactNode } from 'react';

import type { RoutineAdvice } from '@/core/plan/types';
import type { Language } from '@/core/types';
import type { PlanView } from '@/server/plan-view';

import { AlternativesSection, GrapSection, HomeSection, MoreSection } from './advice-lists';
import { AirSection } from './air-section';
import { DayRibbon } from './day-ribbon';
import type { PlanContext } from './links';
import { GlanceSection, MemberSummaries, SevereBanner, Timeline } from './plan-day';
import { AnswerCard, BriefingSection, JumpBar, PlanHeader, StatusLine } from './plan-top';
import type { Briefing } from './plan-top';

export interface PlanBodyProps {
  view: PlanView;
  briefing: Briefing;
  lang: Language;
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
  const { view, briefing, lang, ctx, status, before, intro } = props;
  const { plan } = view;
  const smogDay = view.mode === 'smog-day';
  const answered =
    plan.answer === undefined
      ? undefined
      : plan.routines.find((r) => r.ref === plan.answer?.routineRef);
  const markers = plan.routines
    .filter((r) => r.scheduled)
    .map((r) => ({ label: `${r.memberLabel} ${r.start}`, start: r.start }));

  return (
    <>
      <PlanHeader plan={plan} ctx={ctx} smogDay={smogDay} />
      <StatusLine text={status} />
      {intro}
      <JumpBar hasAnswer={plan.answer !== undefined} />
      {plan.answer === undefined ? null : (
        <AnswerCard
          answer={plan.answer}
          level={answered?.level ?? null}
          question={view.household.question}
        />
      )}
      <BriefingSection briefing={briefing} ctx={ctx} lang={lang} />
      <AirSection air={plan.air} smogDay={smogDay} />
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
      {plan.severe ? <SevereBanner /> : null}
      <Timeline
        plan={plan}
        before={before}
        whatIf={{ action: `${ctx.actionBase}/whatif`, formToken: ctx.formToken }}
      />
      <MemberSummaries members={plan.members} />
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
