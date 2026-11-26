// Reads the numbers out of a sentence for the plan. Layer: core (pure).
import { extractNumbers } from '@/core/text';

/** The 2.5 in the name PM2.5 is part of the name, not a reading, so impact numbers leave it out. */
export const PM25_NAME_NUMBER = 2.5;

/** Every number a sentence states, except the 2.5 inside the name PM2.5, in order and without repeats. */
export function numbersIn(text: string): number[] {
  // 'PM2.5' would otherwise read as the number 2.5; 'PM' is left in its place.
  const withoutName = text.replaceAll('PM2.5', 'PM');
  // A Set drops repeats and keeps the order the numbers first appear in.
  return [...new Set(extractNumbers(withoutName))];
}
