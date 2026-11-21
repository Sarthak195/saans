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

export interface Rule<F extends Record<string, FactValue>, T> {
  id: string;
  when: Condition<F>;
  then: T;
  source: SourceRef;
}

export function matches<F extends Record<string, FactValue>>(
  when: Condition<F>,
  facts: F,
): boolean {
  return (Object.keys(when) as (keyof F)[]).every((key) => {
    const allowed = when[key];
    return allowed === undefined || allowed.includes(facts[key]);
  });
}

/** Rules are ordered from most to least specific; the first one that matches decides. */
export function firstMatch<F extends Record<string, FactValue>, T>(
  rules: readonly Rule<F, T>[],
  facts: F,
): Rule<F, T> | undefined {
  return rules.find((rule) => matches(rule.when, facts));
}

/** Every rule that applies, in order, for lists of advice rather than a single decision. */
export function allMatches<F extends Record<string, FactValue>, T>(
  rules: readonly Rule<F, T>[],
  facts: F,
): Rule<F, T>[] {
  return rules.filter((rule) => matches(rule.when, facts));
}
