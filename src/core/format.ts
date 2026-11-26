import { pm25Level } from '@/core/aqi';

// How numbers and clock times are shown to people. Plan and advice both use these, so the same
// reading never prints two ways.

/** The nearest 5, with no band check: for shares and totals. A PM2.5 shown beside its band uses displayPm25. */
export function roundToFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * PM2.5 as shown to a person: the nearest 5. Where that would print a number from the next band down
 * (251 is Severe but would print as 250, Very Poor), it steps up one so the number and its label agree.
 * Levels are always taken from the unrounded mean, never from this.
 */
export function displayPm25(mean: number): number {
  const rounded = roundToFive(mean);
  return pm25Level(rounded) === pm25Level(mean) ? rounded : rounded + 5;
}

/** One decimal at most, so a total never claims more precision than the numbers behind it. */
export function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Minutes after midnight for a validated 'HH:MM' string. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** 'HH:MM' for minutes after midnight, the reverse of toMinutes. Whole minutes are expected. */
export function fromMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 'HH:MM' from either a clock time or an hour stamp such as '2026-11-24T14:00'. */
export function clockOf(value: string): string {
  // Matches an 'HH:MM' at the very end, so '2026-11-24T14:00' gives '14:00'. A value with none is
  // returned as it is.
  const m = /(\d{2}:\d{2})$/.exec(value);
  return m?.[1] ?? value;
}

/** The values fillTemplate may put into {name} placeholders. */
export type Vars = Readonly<Record<string, string | number>>;

/**
 * Fills {name} placeholders. A placeholder with no value is a mistake in the data, so it throws
 * rather than showing a family a raw brace.
 */
export function fillTemplate(text: string, vars: Vars): string {
  // Matches {name} with letters, digits or underscores, such as {level}.
  return text.replaceAll(/\{(\w+)\}/g, (_whole, name: string) => {
    // Own keys only, so a name such as 'constructor' counts as missing.
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
    if (value === undefined) throw new Error(`No value for {${name}} in: ${text}`);
    return String(value);
  });
}
