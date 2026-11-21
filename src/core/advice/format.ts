import type { Impact } from '@/core/plan/types';

/** Concentrations shown to people are rounded to the nearest 5, so a model estimate never looks exact. */
export function roundToFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/** 'HH:MM' from either a clock time or an hour stamp such as '2026-11-24T14:00'. */
export function clockOf(value: string): string {
  const m = /(\d{2}:\d{2})$/.exec(value);
  return m?.[1] ?? value;
}

/**
 * Fills {name} placeholders. A placeholder with no value is a mistake in the data, so it throws
 * rather than showing a family a raw brace.
 */
export function fillTemplate(
  text: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return text.replace(/\{(\w+)\}/g, (_whole, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`No value for {${name}} in: ${text}`);
    return String(value);
  });
}

/** An impact as written in a data row: its numbers are values or the names of values worked out per household. */
export interface ImpactTemplate {
  kind: Impact['kind'];
  text: string;
  numbers: readonly (number | string)[];
}

export function fillImpact(
  template: ImpactTemplate,
  vars: Readonly<Record<string, string | number>>,
): Impact {
  const numbers = template.numbers.map((n) => {
    if (typeof n === 'number') return n;
    const value = vars[n];
    if (typeof value !== 'number') throw new Error(`No number for ${n} in: ${template.text}`);
    return value;
  });
  return { kind: template.kind, text: fillTemplate(template.text, vars), numbers };
}
