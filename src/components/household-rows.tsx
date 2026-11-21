import type { ReactElement } from 'react';

import { CheckGroup, SelectField, TextField } from './form-fields';
import type { FormState } from '@/server/household-form';
import { AGE, CONDITIONS, DAYS, INTENSITY } from './form-options';
import { KIND_LABEL, MODE_LABEL } from './format';

const MEMBER_ROWS = 6;

export function rows(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function used(state: FormState, prefix: string, key: string): boolean {
  return state.values[`${prefix}${key}`] !== undefined;
}

export function MemberRow({
  state,
  row,
}: {
  readonly state: FormState;
  readonly row: number;
}): ReactElement {
  const p = `m${String(row)}_`;
  return (
    <fieldset className="row">
      <legend>Person {String(row)}</legend>
      <TextField
        state={state}
        name={`${p}label`}
        label="Name or role"
        hint="For example Son, Grandmother or Me. A first name is not needed."
        maxLength={40}
      />
      <SelectField state={state} name={`${p}age`} label="Age group" options={AGE} blank="Choose" />
      <CheckGroup state={state} name={`${p}cond`} legend="Health conditions" options={CONDITIONS} />
    </fieldset>
  );
}

export function RoutineRow({
  state,
  row,
}: {
  readonly state: FormState;
  readonly row: number;
}): ReactElement {
  const p = `r${String(row)}_`;
  const people = rows(MEMBER_ROWS)
    .filter((n) => used(state, `m${String(n)}_`, 'label'))
    .map(
      (n) =>
        [`m${String(n)}`, state.values[`m${String(n)}_label`] ?? `Person ${String(n)}`] as const,
    );
  const memberOptions =
    people.length > 0
      ? people
      : rows(MEMBER_ROWS).map((n) => [`m${String(n)}`, `Person ${String(n)}`] as const);
  return (
    <fieldset className="row">
      <legend>Routine {String(row)}</legend>
      <SelectField
        state={state}
        name={`${p}kind`}
        label="What is it"
        options={Object.entries(KIND_LABEL)}
        blank="No routine"
      />
      <SelectField
        state={state}
        name={`${p}member`}
        label="Who does it"
        options={memberOptions}
        blank="Choose"
      />
      <TextField
        state={state}
        name={`${p}start`}
        label="Start time"
        type="time"
        autoComplete="off"
      />
      <TextField
        state={state}
        name={`${p}minutes`}
        label="Minutes it takes"
        type="number"
        inputMode="numeric"
      />
      <SelectField
        state={state}
        name={`${p}intensity`}
        label="How hard"
        options={INTENSITY}
        fallback="moderate"
      />
      <SelectField
        state={state}
        name={`${p}mode`}
        label="How they travel, if it is a trip"
        options={Object.entries(MODE_LABEL)}
        blank="Not a trip"
      />
      <TextField
        state={state}
        name={`${p}km`}
        label="Distance in km, if it is a trip"
        type="number"
        inputMode="decimal"
        step="any"
      />
      <CheckGroup state={state} name={`${p}days`} legend="Days" options={DAYS} />
      <TextField
        state={state}
        name={`${p}flex`}
        label="Hours it can move either way"
        hint="From 0 to 4. A school run is usually 0."
        type="number"
        inputMode="numeric"
      />
      <TextField
        state={state}
        name={`${p}freeFrom`}
        label="Free from, if the time is limited"
        type="time"
      />
      <TextField state={state} name={`${p}freeTo`} label="Free until" type="time" />
    </fieldset>
  );
}
