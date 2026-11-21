import { M3H_PER_CFM } from '@/core/home/purifier';
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
// A purifier rating counts only with its unit: cfm, or m3/h which is converted. Many purifiers sold
// in India give CADR in m3/h, so a bare "CADR 400" is not assumed to be cfm.
const PURIFIER_CFM: Measure = { units: ['cfm'], min: 1, max: 2000 };
const PURIFIER_M3H: Measure = {
  units: [
    'm3/h',
    'm3/hr',
    'm3 per hour',
    'm³/h',
    'm³/hr',
    'm³ per hour',
    'cmh',
    'cubic metres per hour',
    'cubic meters per hour',
  ],
  min: 2,
  max: Math.round(2000 * M3H_PER_CFM),
};
const PURIFIER_BARE: Measure = { units: ['cadr'], min: 1, max: PURIFIER_M3H.max };

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

/** The purifier's CADR in cfm, or a note that the family gave a number without its unit. */
function readPurifier(
  text: string,
  field: Quoted<number> | undefined,
): { cfm?: number; note?: string } {
  const cfm = measured(text, field, PURIFIER_CFM);
  if (cfm !== undefined) return { cfm };
  const m3h = measured(text, field, PURIFIER_M3H);
  if (m3h !== undefined) return { cfm: Math.max(1, Math.round(m3h / M3H_PER_CFM)) };
  if (measured(text, field, PURIFIER_BARE) !== undefined) {
    return {
      note: 'The purifier rating needs its unit: say whether the CADR is in cfm or m3/h. It was left out for now.',
    };
  }
  return {};
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
  const purifier = readPurifier(text, draft.purifierCadrCfm);
  const purifierCadrCfm = purifier.cfm;
  const home: Home = {
    cooking: cooking ?? COOKING[0],
    habits,
    heating: heating ?? HEATING[0],
    ...(roomSqft === undefined ? {} : { roomSqft }),
    ...(ceilingFt === undefined ? {} : { ceilingFt }),
    ...(purifierCadrCfm === undefined ? {} : { purifierCadrCfm }),
  };
  const notes = [
    ...(cooking === undefined && heating === undefined
      ? ['Assumed cooking on LPG or PNG and no heating. Change it in the form.']
      : []),
    ...(purifier.note === undefined ? [] : [purifier.note]),
  ];
  return { home, notes };
}
