import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { Airing, Glance, MemberSummary, Plan, RoutineAdvice, Window } from '@/core/plan/types';
import type { DaySlot } from '@/core/plan/types';

import { SLOT_LABEL } from './format';
import { RoutineItem } from './routine-item';
import type { WhatIfTarget } from './routine-item';

const SLOTS: readonly DaySlot[] = ['morning', 'afternoon', 'evening'];
const SENSITIVITY_WORD = {
  high: 'Needs the most care',
  raised: 'Needs some extra care',
  general: 'Usual care',
} as const;

function span(window: Window | null): ReactElement {
  if (window === null) return <>No hours with data</>;
  return (
    <>
      {window.start} to {window.end}, PM2.5 about {String(window.pm25)} ({BAND_LABEL[window.level]})
    </>
  );
}

function airingLine(airing: Airing): string {
  switch (airing.kind) {
    case 'normal':
      return 'Open windows as you usually do.';
    case 'window':
      return `Air the home between ${airing.start} and ${airing.end}, when PM2.5 is about ${String(airing.pm25)}.`;
    case 'keep_shut':
      return `Keep windows shut. If you must air the home, ${airing.leastBadHour} is the least bad hour, with PM2.5 about ${String(airing.pm25)}.`;
  }
}

export function GlanceSection({ glance }: { readonly glance: Glance }): ReactElement {
  return (
    <section id="glance" aria-labelledby="glance-title" className="section">
      <h2 id="glance-title">Today at a glance</h2>
      <dl className="glance">
        <div>
          <dt>Cleanest three hours</dt>
          <dd>{span(glance.best)}</dd>
        </div>
        <div>
          <dt>Worst three hours</dt>
          <dd>{span(glance.worst)}</dd>
        </div>
        <div>
          <dt>Airing the home</dt>
          <dd>{airingLine(glance.airing)}</dd>
        </div>
        <div>
          <dt>Most important action</dt>
          <dd>{glance.topAction}</dd>
        </div>
      </dl>
    </section>
  );
}

export function SevereBanner(): ReactElement {
  return (
    <section aria-labelledby="severe-title" className="severe">
      <h2 id="severe-title">The air is very bad today</h2>
      <ol>
        <li>Keep hard exercise and play indoors.</li>
        <li>
          Adults who must go out should wear a well-fitted N95 respirator. Respirators are not made
          for small children, so keep children away from traffic and shorten their trips.
        </li>
        <li>
          Run a purifier, or a box fan with a filter, in the room where the family spends most time.
        </li>
      </ol>
      <p>
        Schools can move outdoor sport and assembly indoors on days like this. Ask your school to do
        so.
      </p>
    </section>
  );
}

function bySlot(routines: readonly RoutineAdvice[], slot: DaySlot): RoutineAdvice[] {
  return routines.filter((r) => r.slot === slot).sort((a, b) => a.start.localeCompare(b.start));
}

/** The day's routines in Morning, Afternoon and Evening, each with its decision, reason and what-if form. */
export function Timeline({
  plan,
  whatIf,
  before,
}: {
  readonly plan: Plan;
  readonly whatIf?: WhatIfTarget | undefined;
  /** The routine as it was before a what-if, so its line can show before and after. */
  readonly before?: RoutineAdvice | undefined;
}): ReactElement {
  return (
    <section id="timeline" aria-labelledby="timeline-title" className="section">
      <h2 id="timeline-title">Timeline</h2>
      {plan.routines.length === 0 ? (
        <p>
          No routines are listed yet. <a href="/household">Add your family&apos;s routines</a> to
          see them here.
        </p>
      ) : null}
      {SLOTS.map((slot) => {
        const items = bySlot(plan.routines, slot);
        if (items.length === 0) return null;
        return (
          <div key={slot} className="slot">
            <h3>{SLOT_LABEL[slot]}</h3>
            <ol className="routines">
              {items.map((advice) => (
                <RoutineItem
                  key={advice.routineId}
                  advice={advice}
                  weekday={plan.day.weekday}
                  whatIf={whatIf}
                  before={before?.routineId === advice.routineId ? before : undefined}
                />
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

export function MemberSummaries({
  members,
}: {
  readonly members: readonly MemberSummary[];
}): ReactElement | null {
  if (members.length === 0) return null;
  return (
    <section id="people" aria-labelledby="people-title" className="section">
      <h2 id="people-title">Each person</h2>
      <ul>
        {members.map((m) => (
          <li key={m.memberId}>
            <strong>{m.label}</strong> ({SENSITIVITY_WORD[m.sensitivity]}):{' '}
            {m.exposureUsual === 0
              ? 'no outdoor routines on this day.'
              : m.percentLess > 0
                ? `about ${String(m.percentLess)}% less PM2.5 over the day's outdoor routines with this plan.`
                : 'the plan leaves their outdoor time as it is.'}
          </li>
        ))}
      </ul>
    </section>
  );
}
