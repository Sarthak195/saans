import { describe, expect, it } from 'vitest';

import { buildAlternatives, grapNote } from '@/core/alternatives';
import { buildCommunity } from '@/core/community';
import { buildHomeAdvice } from '@/core/home';
import { buildPlan } from '@/core/plan/build-plan';
import { writtenAllowance } from '@/core/plan/facts';
import type { Impact, Plan, Reason } from '@/core/plan/types';
import { SAMPLES } from '@/core/profile/samples';
import { checkNumbers } from '@/core/text/numbers';
import { fetchRecordedSeries } from '@/server/air/recorded';
import { at } from '../helpers/plan';

const DAYS = ['today', 'tomorrow', 'day_after'] as const;
// Morning and evening, so both the "today" and the "tomorrow" openings of the plan are walked.
const TIMES = ['08:00', '18:30'] as const;

function reasonText(reason: Reason): string[] {
  return [reason.text];
}

function impactTexts(impact: Impact | undefined): string[] {
  return impact === undefined ? [] : [impact.text];
}

/** Every sentence a person can read in the plan itself. */
function visibleStrings(plan: Plan): string[] {
  return [
    ...plan.days.map((d) => d.label),
    plan.place.name,
    ...plan.members.map((m) => m.label),
    plan.glance.topAction,
    ...plan.routines.flatMap((r) => [
      ...reasonText(r.reason),
      ...impactTexts(r.impact),
      ...r.protection,
    ]),
    ...(plan.answer ? [plan.answer.text] : []),
  ];
}

describe('planFacts covers everything the app shows', () => {
  it.each(SAMPLES.map((s) => [s.id, s] as const))(
    'sample %s: every number in every string is a fact, for each day and time of day',
    async (_id, sample) => {
      const series = await fetchRecordedSeries(sample.recordedId);
      const recordedOn = series.recordedOn ?? '';
      expect(recordedOn).not.toBe('');

      for (const time of TIMES) {
        for (const day of DAYS) {
          const { household } = sample;
          const plan = buildPlan({
            household,
            series,
            now: at(recordedOn, time),
            day,
            ...(sample.question ? { question: sample.question } : {}),
          });
          const homeAdvice = buildHomeAdvice({ household, plan });
          const alternatives = buildAlternatives({ household, plan });
          const community = buildCommunity({ household, plan });
          const grap = grapNote(household.place, plan.air.aqi);
          const allowance = writtenAllowance(plan, {
            home: homeAdvice,
            alternatives,
            community,
            grap,
          });
          const facts = new Set(allowance.numbers);

          const strings = [
            ...visibleStrings(plan),
            ...homeAdvice.flatMap((h) => [
              h.title,
              h.body,
              ...reasonText(h.reason),
              ...impactTexts(h.impact),
            ]),
            ...alternatives.flatMap((a) => [
              a.title,
              a.body,
              ...reasonText(a.reason),
              ...impactTexts(a.impact),
            ]),
            ...community.actions.flatMap((c) => [c.title, c.body, ...reasonText(c.reason)]),
            ...impactTexts(community.aggregate),
            ...(grap ? [grap.text] : []),
          ];
          const where = `${sample.id} ${day} at ${time}`;
          for (const text of strings) {
            // A place name or label keeps its own numbers, but only inside the exact string.
            const checked = checkNumbers(text, allowance.numbers, { masks: allowance.names });
            expect(checked.unknown, `${where}: in "${text}"`).toEqual([]);
          }

          const impacts = [
            ...plan.routines.map((r) => r.impact),
            ...homeAdvice.flatMap((h) => (h.impact ? [h.impact] : [])),
            ...alternatives.map((a) => a.impact),
            ...(community.aggregate ? [community.aggregate] : []),
          ];
          for (const impact of impacts) {
            for (const n of impact.numbers) {
              expect(facts.has(n), `${where}: impact number ${String(n)}`).toBe(true);
            }
          }
        }
      }
    },
  );
});
