import { COOKING, HABITS, HEATING } from '@/core/profile/schema';
import type { Quoted, ReaderOutput } from '@/core/reader/schema';
import { COOKING_TERMS, HABIT_TERMS, HEATING_TERMS, mentionsAny } from '@/core/reader/terms';
import { quoteInText, valueSupportedByQuote } from '@/core/text';
import type { Home } from '@/core/types';

function number(text: string, field: Quoted<number> | undefined): number | undefined {
  const ok =
    field && quoteInText(text, field.quote) && valueSupportedByQuote(field.value, field.quote);
  return ok ? field.value : undefined;
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
  const roomSqft = number(text, draft.roomSqft);
  const ceilingFt = number(text, draft.ceilingFt);
  const purifierCadrCfm = number(text, draft.purifierCadrCfm);
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
