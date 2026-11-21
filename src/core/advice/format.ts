import type { ImpactTemplate } from '@/core/advice/impact-template';
import { fillTemplate } from '@/core/format';
import type { Vars } from '@/core/format';
import type { Impact } from '@/core/plan/types';

/** Turns an impact row into an Impact: named numbers are read from `vars`, so the list always matches the text. */
export function fillImpact(template: ImpactTemplate, vars: Vars): Impact {
  const numbers = template.numbers.map((n) => {
    if (typeof n === 'number') return n;
    const value = vars[n];
    if (typeof value !== 'number') throw new Error(`No number for ${n} in: ${template.text}`);
    return value;
  });
  const impact: Impact = { kind: template.kind, text: fillTemplate(template.text, vars), numbers };
  if (template.source) impact.source = template.source;
  return impact;
}
