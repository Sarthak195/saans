// Builds the lower-emission alternatives for a plan's trips from the sourced rules in
// src/data/transit.json. Layer: core (pure): the household, plan and place come in as arguments,
// and nothing is read from the clock, the network or the environment.
import { fillImpact } from '@/core/advice/format';
import { TRANSIT, transitOptionsFor } from '@/core/alternatives/cities';
import type { TransitOption } from '@/core/alternatives/cities';
import { EXPOSURE, exposureLessPercent } from '@/core/alternatives/exposure';
import { TRIP_RULES } from '@/core/alternatives/rules';
import type { AlternativeThen, TripFacts } from '@/core/alternatives/rules';
import { BAND_LABEL } from '@/core/aqi';
import { fillTemplate, oneDecimal } from '@/core/format';
import type { Alternative, Impact, Plan } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import type { Rule } from '@/core/rules/evaluate';
import type { Household, Mode, Routine, RoutineKind } from '@/core/types';

// A commute, school run or errand is a trip that can change; a walk or a game of cricket is not.
const TRIP_KINDS: readonly RoutineKind[] = ['school_run', 'commute', 'errand'];

// The word for each mode inside a sentence, used for the {vehicle} slot, such as "foot".
const VEHICLE_NAME: Record<Mode, string> = {
  walk: 'foot',
  cycle: 'cycle',
  two_wheeler: 'two-wheeler',
  auto: 'auto',
  car: 'car',
  bus: 'bus',
  metro_rail: 'metro',
};

// The distance band of a trip from its length in km, 'unknown' when the family gave none. The
// edges come from the data; a trip exactly on an edge is 'mid'.
function bandOf(km: number | undefined): TripFacts['band'] {
  if (km === undefined) return 'unknown';
  if (km < TRANSIT.distanceBands.shortBelowKm) return 'short';
  return km > TRANSIT.distanceBands.longAboveKm ? 'long' : 'mid';
}

// Joins names for a sentence: "A", "A or B", "A, B or C". Empty text for an empty list.
function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1) ?? ''}`;
}

// The host of an address without a leading "www.": "https://www.delhimetrorail.com/x" gives
// "delhimetrorail.com".
function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

// The public transport of the place: its options, and whether any of them is a metro or rail.
interface Transit {
  options: readonly TransitOption[];
  rail: boolean;
}

/**
 * The figures and words a trip's rule texts can use, such as {km}, {saved} and {options}. The
 * km-based figures exist only when the trip has a length; an impact that names one without it
 * makes fillImpact throw, which flags a mistake in the data.
 */
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
    // The trip's km is one way: times 2 for the way back, times the days it happens in a week.
    const weekKm = oneDecimal(km * 2 * days);
    vars.km = km;
    vars.days = days;
    vars.weekKm = weekKm;
    // Half the week's car-km, the figure for sharing the ride with one other family.
    vars.halfKm = oneDecimal(weekKm / 2);
    // Combining errands keeps one trip and drops the rest.
    vars.tripsSaved = days - 1;
    // The errand saving: (n - 1) fewer trips of km each. Errands are counted one way only, so
    // the figure is a floor.
    vars.saved = oneDecimal((days - 1) * km);
  }
  // Rail and metro lead where they exist; buses are named only when they are all there is.
  const listed = transit.options.filter((o) => (facts.rail ? o.kind !== 'bus' : o.kind === 'bus'));
  vars.options = joinNames(listed.map((o) => o.name));
  // Operator sites are named once each, by host only; options with no address are left out.
  const hosts = [...new Set(listed.filter((o) => o.url !== '').map((o) => hostOf(o.url)))];
  if (hosts.length > 0)
    vars.links = ` Operator ${hosts.length > 1 ? 'sites' : 'site'}: ${hosts.join(', ')}.`;
  return vars;
}

// The impact line for a rule's alternative. When the rule asks for an exposure comparison and the
// study shows a real gain, the line becomes a 'mode' impact with the percentage and its source.
function transitImpact(
  rule: Rule<TripFacts, AlternativeThen>,
  mode: Mode,
  transit: Transit,
  vars: Record<string, string | number>,
): Impact {
  const { impact } = rule.then;
  // The mode the trip would move to: none unless the rule asks for it. In a city with rail it is
  // the metro, or none when the city has no metro; elsewhere it is the bus.
  const toMode: Mode | null = !rule.then.exposure
    ? null
    : transit.rail
      ? transit.options.some((o) => o.kind === 'metro')
        ? 'metro_rail'
        : null
      : 'bus';
  // A car may be running with its windows shut, which the study found cleaner than the ambient air,
  // so a car trip is never given an air-quality gain; it gets the car-km saving alone.
  const change = toMode && mode !== 'car' ? exposureLessPercent(mode, toMode) : null;
  // No gain worth saying: keep the rule's own impact line as written.
  if (!change) return fillImpact(impact, vars);

  // The percentage is added to the impact's numbers so the shown text and the list agree.
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
 * way back, times the days it happens, and every text says so. Returns an empty list when no trip
 * in the plan has a rule that matches.
 */
export function buildAlternatives(input: { household: Household; plan: Plan }): Alternative[] {
  const { household, plan } = input;
  const { options } = transitOptionsFor(plan.place);
  // A bus-only city (or the generic entry) has no rail, which changes which options are named.
  const transit: Transit = { options, rail: options.some((o) => o.kind !== 'bus') };
  const out: Alternative[] = [];

  for (const advice of plan.routines) {
    const routine = household.routines.find((r) => r.id === advice.routineId);
    const mode = advice.mode;
    // A trip is a weekly habit, so it is considered whatever the plan day's weekday is. A trip not on
    // the plan day has no air reading of its own, so only the rules that do not need one apply.
    if (!routine || mode === undefined || !TRIP_KINDS.includes(advice.kind)) continue;
    // The facts the rules test; a missing length or level becomes 'unknown' instead of a guess.
    const facts: TripFacts = {
      band: bandOf(routine.km),
      mode,
      level: advice.level ?? 'unknown',
      kind: advice.kind,
      rail: transit.rail,
      repeats: routine.days.length >= 2,
    };
    const vars = tripVars(routine, mode, transit, facts);

    for (const rule of allMatches(TRIP_RULES, facts)) {
      const { then } = rule;
      // The study's limits go with every exposure claim, and the car note with a car trip's.
      const caveats = [
        then.exposure ? EXPOSURE.caveat : '',
        then.exposure && mode === 'car' ? EXPOSURE.carNote : '',
      ].filter((text) => text !== '');
      out.push({
        // Unique per trip and rule, so the same rule can apply to two trips.
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
