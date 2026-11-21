import { fillImpact } from '@/core/advice/format';
import { clockOf, fillTemplate, oneDecimal, roundToFive } from '@/core/format';
import type { Vars } from '@/core/format';
import { HOME_RULES, INDOOR } from '@/core/home/data';
import { homeFacts } from '@/core/home/facts';
import { checkPurifier } from '@/core/home/purifier';
import type { HomeAdvice, Plan } from '@/core/plan/types';
import { allMatches } from '@/core/rules/evaluate';
import type { Household } from '@/core/types';

/** The values a row's text may name. Only the ones the household and the day make meaningful are set. */
function variablesFor(household: Household, plan: Plan): Vars {
  const { home } = household;
  const { airing } = plan.glance;
  const vars: Record<string, string | number> = {};

  if (airing.kind === 'window') {
    vars.start = airing.start;
    vars.end = airing.end;
    vars.pm25 = roundToFive(airing.pm25);
  } else if (airing.kind === 'keep_shut') {
    vars.hour = clockOf(airing.leastBadHour);
    vars.pm25 = roundToFive(airing.pm25);
  }

  const check = checkPurifier(home);
  if (home.roomSqft !== undefined && check.needed !== undefined) {
    vars.sqft = Math.round(home.roomSqft);
    vars.needed = check.needed;
    const tall =
      home.ceilingFt !== undefined && home.ceilingFt > INDOOR.assumptions.assumedCeilingFt.value;
    vars.ceilingNote = tall
      ? fillTemplate(INDOOR.ceilingNote, { ceiling: oneDecimal(home.ceilingFt ?? 0) })
      : '';
  }
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
  const rules = allMatches(HOME_RULES, homeFacts(household, plan));

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
      if (then.impact) advice.impact = fillImpact(then.impact, vars);
      if (then.myth) advice.myth = true;
      if (then.safety) advice.safety = true;
      return advice;
    });
}
