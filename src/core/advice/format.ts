import type { ImpactTemplate } from '@/core/advice/source-schema';
import type { Impact } from '@/core/plan/types';

/** Concentrations shown to people are rounded to the nearest 5, so a model estimate never looks exact. */
export function roundToFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/** One decimal at most, so a total never claims more precision than the numbers behind it. */
export function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 'HH:MM' from either a clock time or an hour stamp such as '2026-11-24T14:00'. */
export function clockOf(value: string): string {
  const m = /(\d{2}:\d{2})$/.exec(value);
  return m?.[1] ?? value;
}

export type Vars = Readonly<Record<string, string | number>>;

/**
 * Fills {name} placeholders. A placeholder with no value is a mistake in the data, so it throws
 * rather than showing a family a raw brace.
 */
export function fillTemplate(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (_whole, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`No value for {${name}} in: ${text}`);
    return String(value);
  });
}

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
