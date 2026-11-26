// The rule engine shared by the advice rules: a rule is data (an id, a condition, a result and
// a source), and these functions decide which rules apply to a set of facts. Layer: core (pure).
import type { SourceRef } from '@/core/source';

/** A fact a rule can test: a word such as a band or a mode, a number such as an hour, or a flag. */
export type FactValue = string | number | boolean;

/**
 * A rule condition: each named fact must equal one of the listed values. Facts the condition does not
 * name are ignored, so a rule with an empty condition matches everything (useful as a final default).
 */
export type Condition<F extends Record<string, FactValue>> = {
  readonly [K in keyof F]?: readonly F[K][];
};

/**
 * One rule as data: when its condition holds for the facts, `then` is the result to use. The
 * source says where the advice comes from, so every result can be traced to a document.
 */
export interface Rule<F extends Record<string, FactValue>, T> {
  id: string;
  when: Condition<F>;
  then: T;
  source: SourceRef;
}

/**
 * True when every fact the condition names has one of the listed values. An empty condition is
 * true for any facts. A key whose value is undefined is skipped.
 */
export function matches<F extends Record<string, FactValue>>(
  when: Condition<F>,
  facts: F,
): boolean {
  return (Object.keys(when) as (keyof F)[]).every((key) => {
    const allowed = when[key];
    // An optional key left undefined (as in a spread) means the fact is not tested.
    return allowed === undefined || allowed.includes(facts[key]);
  });
}

/**
 * Rules are ordered from most to least specific; the first one that matches decides. Returns
 * undefined when none matches, so a caller that needs an answer should end its list with a rule
 * that has an empty condition.
 */
export function firstMatch<F extends Record<string, FactValue>, T>(
  rules: readonly Rule<F, T>[],
  facts: F,
): Rule<F, T> | undefined {
  return rules.find((rule) => matches(rule.when, facts));
}

/**
 * Every rule that applies, in order, for lists of advice rather than a single decision. Returns
 * an empty list when none matches.
 */
export function allMatches<F extends Record<string, FactValue>, T>(
  rules: readonly Rule<F, T>[],
  facts: F,
): Rule<F, T>[] {
  return rules.filter((rule) => matches(rule.when, facts));
}
