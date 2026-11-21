import { COOKING, HABITS, HEATING } from '@/core/profile/schema';
import type { Quoted, ReaderOutput } from '@/core/reader/schema';
import {
  COOKING_TERMS,
  HABIT_TERMS,
  HEATING_TERMS,
  escapeRegex,
  mentionsAny,
} from '@/core/reader/terms';
import { quoteInText, valueSupportedByQuote } from '@/core/text';
import type { Home } from '@/core/types';

interface Measure {
  /** The words that show the number is this measure and not another. */
  units: readonly string[];
  min: number;
  max: number;
}

const ROOM: Measure = {
  units: ['sq ft', 'sqft', 'sq. ft', 'square feet', 'square foot', 'sq feet'],
  min: 20,
  max: 5000,
};
const CEILING: Measure = { units: ['ft', 'feet', 'foot'], min: 6, max: 30 };
const PURIFIER: Measure = { units: ['cadr', 'cfm'], min: 1, max: 2000 };

/**
 * A size or rating the family gave. It counts when it is within what a home can have and the text
 * says it with its unit, so a bare "7" in the quote cannot become a room size.
 */
function measured(
  text: string,
  field: Quoted<number> | undefined,
  measure: Measure,
): number | undefined {
  if (!field || !quoteInText(text, field.quote)) return undefined;
  if (!valueSupportedByQuote(field.value, field.quote)) return undefined;
  if (field.value < measure.min || field.value > measure.max) return undefined;
  const unit = measure.units.map(escapeRegex).join('|');
  const after = new RegExp(
    String.raw`(?<![\d.])${String(field.value)}\s*(?:${unit})(?![\p{L}])`,
    'iu',
  );
  const before = new RegExp(
    String.raw`(?:${unit})\s*(?:of|is|:)?\s*${String(field.value)}(?!\d)(?!\.\d)`,
    'iu',
  );
  return after.test(text) || before.test(text) ? field.value : undefined;
}

function termed<V extends string>(
  text: string,
  field: Quoted<V> | undefined,
  table: Record<V, readonly string[]>,
): V | undefined {
  const ok =
    field && quoteInText(text, field.quote) && mentionsAny(field.quote, table[field.value]);
  return ok ? field.value : undefined;
}

/** The home the family described, and a note when a part of it had to be assumed. */
export function readHome(text: string, output: ReaderOutput): { home: Home; notes: string[] } {
  const draft = output.home;
  const cooking = termed(text, draft.cooking, COOKING_TERMS);
  const heating = termed(text, draft.heating, HEATING_TERMS);
  const habits = HABITS.filter((habit) =>
    draft.habits.some((h) => h.value === habit && termed(text, h, HABIT_TERMS) !== undefined),
  );
  const roomSqft = measured(text, draft.roomSqft, ROOM);
  const ceilingFt = measured(text, draft.ceilingFt, CEILING);
  const purifierCadrCfm = measured(text, draft.purifierCadrCfm, PURIFIER);
  const home: Home = {
    cooking: cooking ?? COOKING[0],
    habits,
    heating: heating ?? HEATING[0],
    ...(roomSqft === undefined ? {} : { roomSqft }),
    ...(ceilingFt === undefined ? {} : { ceilingFt }),
    ...(purifierCadrCfm === undefined ? {} : { purifierCadrCfm }),
  };
  const notes =
    cooking === undefined && heating === undefined
      ? ['Assumed cooking on LPG or PNG and no heating. Change it in the form.']
      : [];
  return { home, notes };
}
