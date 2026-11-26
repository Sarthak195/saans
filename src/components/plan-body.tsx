// The whole body of a plan page, section by section. React component layer: it lays out views
// the server already built and decides nothing about the air or the advice itself.
// Sample pages and shared links both render through this one component.
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

/** What the plan body needs: the built view, the optional written briefing, links and flags. */
export interface PlanBodyProps {
  /** The plan and everything built around it for this page. */
  view: PlanView;
  /** Left out when there is no air data to write about. */
  briefing?: WrittenText | undefined;
  /** Where this page sits and how its forms reach back to it. */
  ctx: PlanContext;
  /** A fixed line announced after an action. */
  status?: string | undefined;
  /** The routine as it was before a what-if. */
  before?: RoutineAdvice | undefined;
  /** Link to the community notice page for this household. */
  communityHref: string;
  /** Link back to the form to change the household. */
  editHref: string;
  /** True when the page's address carries the family's profile. */
  shareable: boolean;
  /** Shown under the header, such as how a sample household was described. */
  intro?: ReactNode;
}

/**
 * Every section of a plan, in reading order. Sample pages and shared links render the same
 * body. Sections that need air data are left out when the view says the air is unavailable.
 */
export function PlanBody(props: PlanBodyProps): ReactElement {
  const { view, briefing, ctx, status, before, intro } = props;
  const { plan } = view;
  // The smog-day view shows a recorded smog day, not live air.
  const smogDay = view.mode === 'smog-day';
  // True when there is no air data, so the sections that need it are left out.
  const noAir = view.unavailable !== undefined;
  // Query values every form on the page repeats, so the day and the smog-day view survive a post.
  const keep = { day: plan.day.relative, ...(smogDay ? { air: 'smog-day' } : {}) };
  // Only routines that were given a time are marked on the hour strip.
  const markers = plan.routines
    .filter((r) => r.scheduled)
    .map((r) => ({ label: `${r.memberLabel} ${r.start}`, start: r.start }));

  // The severe banner shows only when the plan is flagged severe. Its title speaks of hours
  // only when the day's AQI is below Very Poor, so it does not contradict the band shown above.
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
          {plan.severe ? (
            <SevereBanner
              scoped={plan.glance.activeStays}
              hoursOnly={
                plan.air.aqi.kind !== 'ok' ||
                (plan.air.aqi.band !== 'very_poor' && plan.air.aqi.band !== 'severe')
              }
            />
          ) : null}
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
