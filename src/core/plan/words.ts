import { extractNumbers } from '@/core/text';

/** The 2.5 in the name PM2.5 is part of the name, not a reading, so impact numbers leave it out. */
export const PM25_NAME_NUMBER = 2.5;

/** Every number a sentence states, except the 2.5 inside the name PM2.5, in order and without repeats. */
export function numbersIn(text: string): number[] {
  const withoutName = text.replaceAll('PM2.5', 'PM');
  return [...new Set(extractNumbers(withoutName))];
}
