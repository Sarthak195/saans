// Builds the community view for a society, school or office: the best outdoor window, the
// actions that apply today, and the car-km saving. Pure core: no clock, network or environment;
// it reads only the plan and household it is given and the sourced rows in community.json.
import { fillTemplate } from '@/core/format';
import { isPoorOrWorse, planLevel } from '@/core/advice/level';
import { DELHI_NCR_ID, cityOf } from '@/core/alternatives/cities';
import { COMMUNITY, COMMUNITY_RULES } from '@/core/community/data';
import type { CommunityFacts } from '@/core/community/facts';
import { bestOutdoorWindow } from '@/core/community/window';
import type { CommunityAction, CommunityPlan, Impact, Plan, Window } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import { normalizeText } from '@/core/text/normalize';
import type { Community, Household } from '@/core/types';

// A household with no community set is read as a housing society with no outdoor slots.
const DEFAULT_COMMUNITY: Community = { kind: 'society', outdoorSlots: [] };

// Turns the best outdoor window into the action that heads the list, wording it from the data.
function windowAction(window: Window): CommunityAction {
  const { action } = COMMUNITY.window;
  // The template fills in the window's start and end (HH:MM) and its PM2.5 in micrograms per
  // cubic metre.
  const vars = { start: window.start, end: window.end, pm25: window.pm25 };
  // A window that is itself poor is only the least bad time, never a good time for sport.
  const words = isPoorOrWorse(window.level) ? action.poor : action;
  return {
    id: action.id,
    title: fillTemplate(words.title, vars),
    body: fillTemplate(words.body, vars),
    reason: { ruleId: action.id, text: action.reason, source: action.source },
  };
}

/** What the community would save by each household replacing one car round trip a day. */
function aggregateImpact(households: number): Impact {
  const { aggregate } = COMMUNITY;
  // Car kilometres a week: households, times the round trip in km, times days a week. Both
  // assumptions come from community.json, and the text says they are assumptions.
  const carKm = households * aggregate.roundTripKm * aggregate.daysPerWeek;
  const vars = {
    households,
    roundTripKm: aggregate.roundTripKm,
    daysPerWeek: aggregate.daysPerWeek,
    carKm,
  };
  return {
    kind: 'distance',
    text: fillTemplate(aggregate.text, vars),
    // Every number the text shows, so written versions of it can be checked against them.
    numbers: [households, aggregate.roundTripKm, carKm, aggregate.daysPerWeek],
    source: aggregate.source,
  };
}

/**
 * The community view for a housing society, school or office: the cleanest outdoor time among its
 * slots, four to six actions picked by the day's level (those that apply to its kind, and to Delhi
 * NCR where GRAP applies), and the car-km saving if its households each swap one trip.
 */
export function buildCommunity(input: { household: Household; plan: Plan }): CommunityPlan {
  const { household, plan } = input;
  const community = household.community ?? DEFAULT_COMMUNITY;
  // The facts the community rules test. `level` is the worst 3-hour block of the plan day;
  // `ncr` is true for a place in Delhi NCR and `delhi` for a place in the state of Delhi. The
  // state name is lower-cased and tidied by normalizeText before it is compared.
  const facts: CommunityFacts = {
    kind: community.kind,
    level: planLevel(plan),
    ncr: cityOf(plan.place)?.id === DELHI_NCR_ID,
    delhi: normalizeText(plan.place.admin1) === 'delhi',
  };

  const bestWindow = bestOutdoorWindow(plan, community.outdoorSlots);
  // Every rule that matches, ordered by its priority (lower first). The original position
  // breaks ties, so the order in community.json is kept for rules with the same priority.
  const rows = allMatches(COMMUNITY_RULES, facts)
    .map((rule, order) => ({ rule, order }))
    .sort((a, b) => a.rule.then.priority - b.rule.then.priority || a.order - b.order)
    .map(({ rule }): CommunityAction => ({
      id: rule.id,
      title: rule.then.title,
      body: rule.then.body,
      reason: { ruleId: rule.id, text: rule.then.reason, source: rule.source },
    }));

  // The window leads: it is the one action tied to this community's own timetable.
  // The list is then cut to the limit set in community.json.
  const actions = [...(bestWindow ? [windowAction(bestWindow)] : []), ...rows].slice(
    0,
    COMMUNITY.maxActions,
  );
  const result: CommunityPlan = { kind: community.kind, actions, bestOutdoorWindow: bestWindow };
  // The saving needs a household count, so it is left out when the community did not give one.
  if (community.households !== undefined) result.aggregate = aggregateImpact(community.households);
  return result;
}
