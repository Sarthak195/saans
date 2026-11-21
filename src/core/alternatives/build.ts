import { fillImpact } from '@/core/advice/format';
import { TRANSIT, transitOptionsFor } from '@/core/alternatives/cities';
import type { TransitOption } from '@/core/alternatives/cities';
import { EXPOSURE, exposureLessPercent } from '@/core/alternatives/exposure';
import { TRIP_RULES } from '@/core/alternatives/rules';
import type { AlternativeThen, TripFacts } from '@/core/alternatives/rules';
import { planLevel } from '@/core/advice/level';
import { BAND_LABEL } from '@/core/aqi';
import { fillTemplate, oneDecimal } from '@/core/format';
import type { Alternative, Impact, Plan } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import type { Rule } from '@/core/rules/evaluate';
import type { Household, Mode, Routine, RoutineKind } from '@/core/types';

// A commute, school run or errand is a trip that can change; a walk or a game of cricket is not.
const TRIP_KINDS: readonly RoutineKind[] = ['school_run', 'commute', 'errand'];

const VEHICLE_NAME: Record<Mode, string> = {
  walk: 'foot',
  cycle: 'cycle',
  two_wheeler: 'two-wheeler',
  auto: 'auto',
  car: 'car',
  bus: 'bus',
  metro_rail: 'metro',
};

function bandOf(km: number | undefined): TripFacts['band'] {
  if (km === undefined) return 'unknown';
  if (km < TRANSIT.distanceBands.shortBelowKm) return 'short';
  return km > TRANSIT.distanceBands.longAboveKm ? 'long' : 'mid';
}

function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}`;
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

interface Transit {
  options: readonly TransitOption[];
  rail: boolean;
}

/** The facts and the words a trip's rules need; km-based values exist only when the trip has a length. */
function tripVars(
  routine: Routine,
  mode: Mode,
  transit: Transit,
  facts: TripFacts,
): Record<string, string | number> {
  const vars: Record<string, string | number> = {
    vehicle: VEHICLE_NAME[mode],
    levelLabel: facts.level === 'unknown' ? '' : BAND_LABEL[facts.level],
    exposureNote: '',
    links: '',
  };
  const { km } = routine;
  const days = routine.days.length;
  if (km !== undefined) {
    const weekKm = oneDecimal(km * 2 * days);
    vars.km = km;
    vars.days = days;
    vars.weekKm = weekKm;
    vars.halfKm = oneDecimal(weekKm / 2);
    vars.tripsSaved = days - 1;
    // Errands are counted one way only: (n - 1) trips of km each, so the figure is a floor.
    vars.saved = oneDecimal((days - 1) * km);
  }
  // Rail and metro lead where they exist; buses are named only when they are all there is.
  const listed = transit.options.filter((o) => (facts.rail ? o.kind !== 'bus' : o.kind === 'bus'));
  vars.options = joinNames(listed.map((o) => o.name));
  const hosts = [...new Set(listed.filter((o) => o.url !== '').map((o) => hostOf(o.url)))];
  if (hosts.length > 0)
    vars.links = ` Operator ${hosts.length > 1 ? 'sites' : 'site'}: ${hosts.join(', ')}.`;
  return vars;
}

function transitImpact(
  rule: Rule<TripFacts, AlternativeThen>,
  mode: Mode,
  transit: Transit,
  vars: Record<string, string | number>,
): Impact {
  const { impact } = rule.then;
  const toMode: Mode | null = !rule.then.exposure
    ? null
    : transit.rail
      ? transit.options.some((o) => o.kind === 'metro')
        ? 'metro_rail'
        : null
      : 'bus';
  // A car may be running with its windows shut, which the study found cleaner than the roadside,
  // so a car trip is never given an air-quality gain; it gets the car-km saving alone.
  const change = toMode && mode !== 'car' ? exposureLessPercent(mode, toMode) : null;
  if (!change) return fillImpact(impact, vars);

  const note = fillTemplate(EXPOSURE.exposureNote, {
    less: change.less,
    fromPhrase: change.fromPhrase,
    toPhrase: change.toPhrase,
  });
  const filled = fillImpact(
    { ...impact, numbers: [...impact.numbers, change.less] },
    { ...vars, exposureNote: note },
  );
  return { ...filled, kind: 'mode', percentLess: change.less, source: change.source };
}

/**
 * Lower-emission options for each trip in the plan: walking or cycling a short trip when the air
 * allows it, the city's public transport for a mid or long trip, a shared ride and no idling for
 * a car, and combining errands. The car-km saving is the trip's length one way, times 2 for the
 * way back, times the days it happens, and every text says so.
 */
export function buildAlternatives(input: { household: Household; plan: Plan }): Alternative[] {
  const { household, plan } = input;
  const { options } = transitOptionsFor(plan.place);
  const transit: Transit = { options, rail: options.some((o) => o.kind !== 'bus') };
  const out: Alternative[] = [];

  for (const advice of plan.routines) {
    const routine = household.routines.find((r) => r.id === advice.routineId);
    const mode = advice.mode;
    // A trip is a weekly habit, so it is considered whatever the plan day's weekday is. A trip not on
    // the plan day has no hours of its own to read, so the plan day's level stands in for it.
    if (!routine || mode === undefined || !TRIP_KINDS.includes(advice.kind)) continue;
    const facts: TripFacts = {
      band: bandOf(routine.km),
      mode,
      level: advice.scheduled ? (advice.level ?? 'unknown') : planLevel(plan),
      kind: advice.kind,
      rail: transit.rail,
      repeats: routine.days.length >= 2,
    };
    const vars = tripVars(routine, mode, transit, facts);

    for (const rule of allMatches(TRIP_RULES, facts)) {
      const { then } = rule;
      const caveats = [
        then.exposure ? EXPOSURE.caveat : '',
        then.exposure && mode === 'car' ? EXPOSURE.carNote : '',
      ].filter((text) => text !== '');
      out.push({
        id: `${advice.ref}:${rule.id}`,
        routineRef: advice.ref,
        title: fillTemplate(then.title, vars),
        body: fillTemplate(then.body, vars),
        reason: { ruleId: rule.id, text: [then.reason, ...caveats].join(' '), source: rule.source },
        impact: transitImpact(rule, mode, transit, vars),
      });
    }
  }
  return out;
}
