// Field components for the household form: each ties its label, hint and error line together for
// screen readers. Component layer: they show the state they are given and decide nothing.
import type { ReactElement } from 'react';

import type { FormError, FormState } from '@/server/household-form';

/** The id of a field's input, also the target of the links in the error summary. */
export function fieldId(name: string): string {
  return `f-${name}`;
}

// The message for a field, or undefined when it has no error.
function errorOf(state: FormState, name: string): string | undefined {
  return state.errors.find((e) => e.field === name)?.message;
}

// The error text under a label, with the id that aria-describedby points to.
function ErrorLine({
  name,
  message,
}: {
  readonly name: string;
  readonly message: string | undefined;
}): ReactElement | null {
  return message === undefined ? null : (
    <p id={`${fieldId(name)}-error`} className="field-error">
      {message}
    </p>
  );
}

// The ids of the hint and error lines a field has, joined for aria-describedby, or
// undefined when it has neither.
function describedBy(
  name: string,
  hint: string | undefined,
  message: string | undefined,
): string | undefined {
  const ids = [
    hint === undefined ? '' : `${fieldId(name)}-hint`,
    message === undefined ? '' : `${fieldId(name)}-error`,
  ].filter((id) => id !== '');
  return ids.length === 0 ? undefined : ids.join(' ');
}

/**
 * A labelled text, number or time input with an optional hint and error. It starts from the saved
 * value, so a form sent back with mistakes shows what the family typed.
 */
export function TextField(props: {
  state: FormState;
  name: string;
  label: string;
  hint?: string;
  type?: 'text' | 'number' | 'time';
  inputMode?: 'numeric' | 'decimal' | 'text';
  autoComplete?: string;
  maxLength?: number;
  step?: string;
}): ReactElement {
  const { state, name, label, hint } = props;
  const message = errorOf(state, name);
  // Optional attributes are added only when they are set.
  return (
    <div className="field">
      <label htmlFor={fieldId(name)}>{label}</label>
      {hint === undefined ? null : (
        <p id={`${fieldId(name)}-hint`} className="small">
          {hint}
        </p>
      )}
      <ErrorLine name={name} message={message} />
      <input
        id={fieldId(name)}
        name={name}
        type={props.type ?? 'text'}
        defaultValue={state.values[name] ?? ''}
        autoComplete={props.autoComplete ?? 'off'}
        {...(props.inputMode === undefined ? {} : { inputMode: props.inputMode })}
        {...(props.maxLength === undefined ? {} : { maxLength: props.maxLength })}
        {...(props.step === undefined ? {} : { step: props.step })}
        aria-invalid={message === undefined ? undefined : true}
        aria-describedby={describedBy(name, hint, message)}
      />
    </div>
  );
}

/**
 * A labelled select. It starts from the saved value, else `fallback`, else the first choice;
 * `blank` adds an empty first choice.
 */
export function SelectField(props: {
  state: FormState;
  name: string;
  label: string;
  options: readonly (readonly [string, string])[];
  /** Text for the empty choice; leave out when a choice is always needed. */
  blank?: string;
  fallback?: string;
}): ReactElement {
  const { state, name, label } = props;
  const message = errorOf(state, name);
  return (
    <div className="field">
      <label htmlFor={fieldId(name)}>{label}</label>
      <ErrorLine name={name} message={message} />
      <select
        id={fieldId(name)}
        name={name}
        defaultValue={state.values[name] ?? props.fallback ?? ''}
        aria-invalid={message === undefined ? undefined : true}
        aria-describedby={describedBy(name, undefined, message)}
      >
        {props.blank === undefined ? null : <option value="">{props.blank}</option>}
        {props.options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A group of checkboxes sharing one name. The saved value is the chosen keys joined by commas, and
 * the fieldset can take focus so an error link can reach it.
 */
export function CheckGroup(props: {
  state: FormState;
  name: string;
  legend: string;
  options: readonly (readonly [string, string])[];
}): ReactElement {
  const { state, name } = props;
  // A value that was never saved splits to one empty key, which matches no option.
  const chosen = (state.values[name] ?? '').split(',');
  const message = errorOf(state, name);
  return (
    <fieldset className="checks" id={fieldId(name)} tabIndex={-1}>
      <legend>{props.legend}</legend>
      <ErrorLine name={name} message={message} />
      {props.options.map(([value, text]) => (
        <label key={value} className="check">
          <input
            type="checkbox"
            name={name}
            value={value}
            defaultChecked={chosen.includes(value)}
          />
          {text}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * What is wrong, as links to the fields, shown first and announced as soon as the page loads.
 * It renders nothing when there are no errors.
 */
export function ErrorSummary({
  errors,
}: {
  readonly errors: readonly FormError[];
}): ReactElement | null {
  if (errors.length === 0) return null;
  return (
    <section
      id="error-summary"
      tabIndex={-1}
      role="alert"
      className="error-summary"
      aria-labelledby="error-summary-title"
    >
      <h2 id="error-summary-title">Check these details</h2>
      <ul>
        {errors.map((e) => (
          <li key={`${e.field}-${e.message}`}>
            <a href={`#${fieldId(e.field)}`}>{e.message}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
