import { fillTemplate } from '@/core/advice/format';
import { planLevel } from '@/core/advice/level';
import { DELHI_NCR_ID, cityOf } from '@/core/alternatives/cities';
import { COMMUNITY, COMMUNITY_RULES } from '@/core/community/data';
import type { CommunityFacts } from '@/core/community/facts';
import { bestOutdoorWindow } from '@/core/community/window';
import type { CommunityAction, CommunityPlan, Impact, Plan, Window } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import type { Community, Household } from '@/core/types';

// A household with no community set is read as a housing society with no outdoor slots.
const DEFAULT_COMMUNITY: Community = { kind: 'society', outdoorSlots: [] };

function windowAction(window: Window): CommunityAction {
  const { action } = COMMUNITY.window;
  const vars = { start: window.start, end: window.end, pm25: window.pm25 };
  return {
    id: action.id,
    title: fillTemplate(action.title, vars),
    body: fillTemplate(action.body, vars),
    reason: { ruleId: action.id, text: action.reason, source: action.source },
  };
}

/** What the community would save by each household replacing one car round trip a day. */
function aggregateImpact(households: number): Impact {
  const { aggregate } = COMMUNITY;
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
  const facts: CommunityFacts = {
    kind: community.kind,
    level: planLevel(plan),
    ncr: cityOf(plan.place)?.id === DELHI_NCR_ID,
  };

  const bestWindow = bestOutdoorWindow(plan, community.outdoorSlots);
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
  const actions = [...(bestWindow ? [windowAction(bestWindow)] : []), ...rows].slice(
    0,
    COMMUNITY.maxActions,
  );
  const result: CommunityPlan = { kind: community.kind, actions, bestOutdoorWindow: bestWindow };
  if (community.households !== undefined) result.aggregate = aggregateImpact(community.households);
  return result;
}
