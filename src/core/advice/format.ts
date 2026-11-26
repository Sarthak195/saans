// Fills an impact row from the data files with the numbers worked out for one household. Pure:
// no clock, network or environment.
import type { ImpactTemplate } from '@/core/advice/impact-template';
import { fillTemplate } from '@/core/format';
import type { Vars } from '@/core/format';
import type { Impact } from '@/core/plan/types';

/**
 * Turns an impact row into an Impact. Named numbers are read from `vars`, so the list always
 * matches the text. Throws when a named number is missing or is not a number, because that is a
 * mistake in the data and a family should never see it.
 */
export function fillImpact(template: ImpactTemplate, vars: Vars): Impact {
  const numbers = template.numbers.map((n) => {
    if (typeof n === 'number') return n;
    // A name is looked up in `vars`; a string value would not be a number to show.
    const value = vars[n];
    if (typeof value !== 'number') throw new Error(`No number for ${n} in: ${template.text}`);
    return value;
  });
  const impact: Impact = { kind: template.kind, text: fillTemplate(template.text, vars), numbers };
  // The source is copied only when the row has one.
  if (template.source) impact.source = template.source;
  return impact;
}
