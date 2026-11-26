// The household form as fields, for a family that prefers a form to writing a few lines.
// Component layer: it shows the values and errors it is given and posts to /household/save,
// where the server does the checking.
import type { ReactElement } from 'react';

import { CheckGroup, ErrorSummary, SelectField, TextField } from './form-fields';
import type { FormState } from '@/server/household-form';
import { COOKING, HABITS, HEATING, PURIFIER_UNITS } from './form-options';
import { MemberRow, RoutineRow, rows } from './household-rows';
import { LocationButton, type Coords } from './location-button';

/** A device location carried from an earlier page (or a form sent back with mistakes), if any. */
function coordsOf(values: FormState['values']): Coords | undefined {
  return values.lat === undefined || values.lon === undefined
    ? undefined
    : { lat: values.lat, lon: values.lon };
}

// The form offers up to 6 people and 8 routines. The first 2 people and 3 routines show at once;
// the rest sit in a disclosure.
const MEMBER_ROWS = 6;
const ROUTINE_ROWS = 8;
const VISIBLE_MEMBERS = 2;
const VISIBLE_ROUTINES = 3;

/** Extra rows sit in a disclosure that opens by itself when one already holds something. */
function MoreRows({
  state,
  from,
  to,
  prefix,
  label,
  children,
}: {
  readonly state: FormState;
  readonly from: number;
  readonly to: number;
  readonly prefix: string;
  readonly label: string;
  readonly children: (row: number) => ReactElement;
}): ReactElement {
  const rowsHere = rows(to).filter((n) => n >= from);
  // Row fields are named by prefix, row number and "_", such as m3_age or r4_start.
  const filled = rowsHere.some((n) =>
    Object.keys(state.values).some((k) => k.startsWith(`${prefix}${String(n)}_`)),
  );
  // The disclosure opens when a hidden row holds a value or an error, so nothing the family
  // entered is hidden from them.
  return (
    <details
      open={
        filled ||
        state.errors.some((e) => rowsHere.some((n) => e.field.startsWith(`${prefix}${String(n)}_`)))
      }
    >
      <summary>{label}</summary>
      {rowsHere.map((n) => (
        <div key={n}>{children(n)}</div>
      ))}
    </details>
  );
}

/**
 * The whole household as fields. `draftText` and `draftReason` come from an earlier step that
 * needed one more answer. The form is not checked in the browser: the server checks it and sends
 * every mistake back at once.
 */
export function HouseholdForm({
  state,
  formToken,
  draftText,
  draftReason,
}: {
  readonly state: FormState;
  readonly formToken: string;
  /** Words the family already wrote, shown so they can read them while filling in the form. */
  readonly draftText?: string | undefined;
  readonly draftReason?: string | undefined;
}): ReactElement {
  // Order: the error summary, the reason and the words from an earlier step, then the form in four
  // parts (where, who, routines, home).
  return (
    <>
      <ErrorSummary errors={state.errors} />
      {draftReason === undefined ? null : (
        <p role="status" className="notice">
          {draftReason}
        </p>
      )}
      {draftText === undefined || draftText === '' ? null : (
        <section aria-labelledby="draft-title">
          <h2 id="draft-title">What you wrote</h2>
          <p className="notice-text">{draftText}</p>
        </section>
      )}
      <form method="post" action="/household/save" noValidate>
        <input type="hidden" name="formToken" value={formToken} />

        <section aria-labelledby="where-title" className="section">
          <h2 id="where-title">Where you are</h2>
          <TextField
            state={state}
            name="place"
            label="Place in India"
            hint="A city, town or area, such as Lajpat Nagar or Pune."
            autoComplete="address-level2"
            maxLength={80}
          />
          <p className="actions">
            <LocationButton initial={coordsOf(state.values)} />
          </p>
          <SelectField
            state={state}
            name="lang"
            label="Language for the short summary"
            options={[
              ['en', 'English'],
              ['hi', 'Hindi'],
            ]}
            fallback="en"
          />
        </section>

        <section aria-labelledby="people-form-title" className="section">
          <h2 id="people-form-title">Who is in the family</h2>
          {rows(VISIBLE_MEMBERS).map((n) => (
            <MemberRow key={n} state={state} row={n} />
          ))}
          <MoreRows
            state={state}
            from={VISIBLE_MEMBERS + 1}
            to={MEMBER_ROWS}
            prefix="m"
            label="Add more people"
          >
            {(n) => <MemberRow state={state} row={n} />}
          </MoreRows>
        </section>

        <section aria-labelledby="routines-form-title" className="section">
          <h2 id="routines-form-title">Their outdoor routines</h2>
          {rows(VISIBLE_ROUTINES).map((n) => (
            <RoutineRow key={n} state={state} row={n} />
          ))}
          <MoreRows
            state={state}
            from={VISIBLE_ROUTINES + 1}
            to={ROUTINE_ROWS}
            prefix="r"
            label="Add more routines"
          >
            {(n) => <RoutineRow state={state} row={n} />}
          </MoreRows>
        </section>

        <section aria-labelledby="home-form-title" className="section">
          <h2 id="home-form-title">Your home</h2>
          <SelectField
            state={state}
            name="cooking"
            label="How you cook"
            options={COOKING}
            fallback="lpg_png"
          />
          <SelectField
            state={state}
            name="heating"
            label="How you heat the home"
            options={HEATING}
            fallback="none"
          />
          <CheckGroup state={state} name="habits" legend="Indoor habits" options={HABITS} />
          <TextField
            state={state}
            name="roomSqft"
            label="Size of the main room in square feet"
            type="number"
            inputMode="numeric"
          />
          <TextField
            state={state}
            name="ceilingFt"
            label="Ceiling height in feet"
            type="number"
            inputMode="decimal"
            step="any"
          />
          <SelectField
            state={state}
            name="purifierUnit"
            label="Unit of the purifier's clean air delivery rate (CADR)"
            options={PURIFIER_UNITS}
            fallback="cfm"
          />
          <TextField
            state={state}
            name="purifierCadrCfm"
            label="Air purifier clean air delivery rate, if you have one"
            hint="Check the box or the label: it is given in cfm or in m3/h. Choose that unit above."
            type="number"
            inputMode="numeric"
          />
        </section>

        <p>
          <button className="button" type="submit">
            Make my plan
          </button>
        </p>
      </form>
    </>
  );
}
