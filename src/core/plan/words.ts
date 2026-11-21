import { extractNumbers } from '@/core/text';

/** The 2.5 in the name PM2.5 is part of the name, not a reading, so impact numbers leave it out. */
export const PM25_NAME_NUMBER = 2.5;

/** Fills {name} placeholders in a rule's wording. An unknown placeholder is a data error, so it throws. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => {
    const value = Object.hasOwn(values, key) ? values[key] : undefined;
    if (value === undefined) throw new Error(`Template uses {${key}} but no value was given`);
    return value;
  });
}

/** Every number a sentence states, except the 2.5 inside the name PM2.5, in order and without repeats. */
export function numbersIn(text: string): number[] {
  const withoutName = text.replaceAll('PM2.5', 'PM');
  return [...new Set(extractNumbers(withoutName))];
}
