// Builds the advice about the home for one plan day: airing, purifier fit, cooking, heating,
// smoke sources and myths.
// Core layer, pure: no clock, network or environment. The wording and conditions live in the
// indoor data rows, and this file picks the rows that apply, fills them in and orders them.
import { fillImpact } from '@/core/advice/format';
import { clockOf, fillTemplate, oneDecimal, roundToFive } from '@/core/format';
import type { Vars } from '@/core/format';
import { HOME_RULES, INDOOR } from '@/core/home/data';
import { homeFacts } from '@/core/home/facts';
import { M3H_PER_CFM, checkPurifier } from '@/core/home/purifier';
import type { HomeAdvice, Plan } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import type { Household } from '@/core/types';

/**
 * The values a row's text may name. Only the ones the household and the day make meaningful are
 * set. fillTemplate throws on a name with no value, so a row must name only values its own
 * conditions guarantee.
 */
function variablesFor(household: Household, plan: Plan): Vars {
  const { home } = household;
  const { airing } = plan.glance;
  const vars: Record<string, string | number> = {};

  // The airing window gives its start and end (IST 'HH:MM') and its PM2.5 (micrograms per cubic
  // metre, to the nearest 5). On a keep-shut day the least bad hour is named instead.
  if (airing.kind === 'window') {
    vars.start = airing.start;
    vars.end = airing.end;
    vars.pm25 = roundToFive(airing.pm25);
  } else if (airing.kind === 'keep_shut') {
    vars.hour = clockOf(airing.leastBadHour);
    vars.pm25 = roundToFive(airing.pm25);
  }

  // The purifier numbers need a known room size. The metric figure converts the cfm need, since
  // many purifiers in India are rated in cubic metres per hour.
  const check = checkPurifier(home);
  if (home.roomSqft !== undefined && check.needed !== undefined) {
    vars.sqft = Math.round(home.roomSqft);
    vars.needed = check.needed;
    vars.neededM3h = roundToFive(check.needed * M3H_PER_CFM);
    // The ceiling note is an empty string unless the ceiling is above the assumed height.
    const tall =
      home.ceilingFt !== undefined && home.ceilingFt > INDOOR.assumptions.assumedCeilingFt.value;
    vars.ceilingNote = tall
      ? fillTemplate(INDOOR.ceilingNote, { ceiling: oneDecimal(home.ceilingFt ?? 0) })
      : '';
  }
  // The purifier's own rating and the gap to the need are set only when a purifier was given.
  if (check.have !== undefined) vars.have = check.have;
  if (check.gap !== undefined) vars.gap = check.gap;
  return vars;
}

/**
 * Advice for the home, most urgent first. Rows are data: each fires when its conditions match the
 * household and the plan day, and life-safety rows (carbon monoxide) carry priority 0 so they
 * come before every shut-windows row.
 */
export function buildHomeAdvice(input: { household: Household; plan: Plan }): HomeAdvice[] {
  const { household, plan } = input;
  const vars = variablesFor(household, plan);
  // Every row whose conditions match, in file order, not only the first.
  const rules = allMatches(HOME_RULES, homeFacts(household, plan));

  // Lowest priority number first, so life-safety rows (priority 0) lead. The file position breaks
  // ties, so the same household always gets the same order.
  return rules
    .map((rule, order) => ({ rule, order }))
    .sort((a, b) => a.rule.then.priority - b.rule.then.priority || a.order - b.order)
    .map(({ rule }): HomeAdvice => {
      const { then } = rule;
      const advice: HomeAdvice = {
        id: rule.id,
        priority: then.priority,
        title: fillTemplate(then.title, vars),
        body: fillTemplate(then.body, vars),
        reason: { ruleId: rule.id, text: then.reason, source: rule.source },
      };
      // The impact, myth and safety fields are carried over only when the row sets them.
      if (then.impact) advice.impact = fillImpact(then.impact, vars);
      if (then.myth) advice.myth = true;
      if (then.safety) advice.safety = true;
      return advice;
    });
}
