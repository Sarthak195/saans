// Fixed English wording for a briefing or a community notice, used when the written text is not
// available or fails its checks. Pure: it reads only the computed plan.
import { BAND_LABEL } from '@/core/aqi';
import { routineName } from '@/core/briefing/names';
import type { CommunityPlan, Plan, RoutineAdvice, Window } from '@/core/plan/types';

// The wording used when the AI writer is not available. Built only from the computed plan, so
// every number and time in it is the plan's own. English only: there is no Hindi template.

/** The note shown when Hindi was asked for but only the English template can be given. */
export const HINDI_UNAVAILABLE = 'Hindi wording is unavailable right now, so this is in English.';

// How many changed routines the briefing names one by one; the rest are counted.
const MAX_ROUTINES_NAMED = 3;
// How a community notice calls its audience.
const KIND_WORD: Record<CommunityPlan['kind'], string> = {
  society: 'society',
  school: 'school',
  office: 'office',
};

// The day's AQI sentence, or a plain note when there is not enough data for a daily AQI.
function aqiSentence(plan: Plan): string {
  const { aqi } = plan.air;
  return aqi.kind === 'ok'
    ? `The air quality index today is ${String(aqi.aqi)} (${BAND_LABEL[aqi.band]}, a model estimate).`
    : 'There is not enough data yet for a daily air quality index.';
}

// A window as "start to end", with the times as the plan writes them.
function span(w: Window): string {
  return `${w.start} to ${w.end}`;
}

// Sentences for the cleanest and the worst time of the day; each is left out when there is none.
function windowSentences(plan: Plan): string[] {
  const { best, worst } = plan.glance;
  const out: string[] = [];
  if (best) {
    out.push(
      `The cleanest time outdoors is ${span(best)}, with PM2.5 around ${String(best.pm25)}.`,
    );
  }
  if (worst) out.push(`The worst time is ${span(worst)}, around ${String(worst.pm25)}.`);
  return out;
}

// One sentence for a routine, worded by the plan's decision about it. The PM2.5 figure is in
// micrograms per cubic metre as the plan rounds it, and is left out when the plan has none.
function routineSentence(r: RoutineAdvice): string {
  const what = `${routineName(r)} at ${r.start}`;
  const air = r.pm25 === null ? '' : ` (PM2.5 around ${String(r.pm25)})`;
  switch (r.decision) {
    case 'indoors':
      return `${what}: stay indoors${air}.`;
    case 'move': {
      const less =
        r.impact.percentLess === undefined
          ? ''
          : `, about ${String(r.impact.percentLess)}% less PM2.5`;
      return r.window
        ? `${what}: move it to ${span(r.window)}${air}${less}.`
        : `${what}: move it to a cleaner time${air}.`;
    }
    case 'lighten':
      return `${what}: keep it shorter and lighter${air}.`;
    case 'essential':
      return `${what}: go only if you must, with protection${air}.`;
    case 'keep':
      return `${what}: no change.`;
  }
}

/** A short plan summary from the computed plan, for when the AI writer is paused or unavailable. */
export function templateBriefing(plan: Plan): string {
  // Only routines that happen on this day and that the plan changes are worth a sentence.
  const changing = plan.routines.filter((r) => r.scheduled && r.decision !== 'keep');
  const sentences = [`Plan for ${plan.day.label}.`, aqiSentence(plan), ...windowSentences(plan)];
  if (changing.length === 0) {
    sentences.push('No routine needs to change for this day.');
  } else {
    sentences.push(...changing.slice(0, MAX_ROUTINES_NAMED).map(routineSentence));
    // The routines beyond the named few are counted, and the plan below lists them.
    const more = changing.length - MAX_ROUTINES_NAMED;
    if (more > 0)
      sentences.push(`${String(more)} more routines change too, as the plan below shows.`);
  }
  sentences.push(plan.glance.topAction);
  return sentences.join(' ');
}

/** A short notice from the computed community plan, ready to copy. */
export function templateNotice(plan: Plan, community: CommunityPlan): string {
  const sentences = [
    `Air notice for our ${KIND_WORD[community.kind]}, ${plan.day.label}.`,
    aqiSentence(plan),
  ];
  const best = community.bestOutdoorWindow;
  if (best) {
    sentences.push(
      `The best time for outdoor activity is ${span(best)}, with PM2.5 around ${String(best.pm25)}.`,
    );
  }
  // At most three actions, so the notice stays short.
  const actions = community.actions.slice(0, 3).map((a) => a.title);
  if (actions.length > 0) sentences.push(`Please: ${actions.join('; ')}.`);
  return sentences.join(' ');
}
