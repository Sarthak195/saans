// One routine of the day as the plan shows it: the decision, the reason, a cleaner time, how to
// protect against the air and the what-if form. Components layer: it renders the advice the core
// built, and the what-if form is a plain HTML post that works without JavaScript.
import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { RoutineAdvice } from '@/core/plan/types';
import { MODES } from '@/core/profile/schema';
import type { Weekday } from '@/core/types';

import { BandBadge, DecisionTag } from './band';
import { SourceLink } from './source-link';
import { DECISION_WORD, KIND_LABEL, MODE_LABEL, WEEKDAY_LONG } from './format';

/** Where the what-if form posts and what it carries back, so the new page matches this one. */
export interface WhatIfTarget {
  /** Where the what-if form posts, such as '/plan/<token>/whatif'. */
  action: string;
  /** The signed form token the route checks before it accepts the post (SECURITY.md). */
  formToken: string;
  /** Values the new plan page should keep, such as the day, sent back with the form. */
  keep?: Readonly<Record<string, string>>;
}

// The air for a routine in words: PM2.5 (micrograms per cubic metre) and its band, or a note
// that the routine's hours have no data.
function reading(advice: RoutineAdvice): string {
  if (advice.pm25 === null || advice.level === null) return 'no air data for this time';
  return `PM2.5 about ${String(advice.pm25)} (${BAND_LABEL[advice.level]})`;
}

// A phrase giving the decision, start time, mode if set, and the air reading.
function summaryOf(advice: RoutineAdvice): string {
  const mode = advice.mode === undefined ? '' : `, ${MODE_LABEL[advice.mode].toLowerCase()}`;
  return `${DECISION_WORD[advice.decision]} at ${advice.start}${mode}, ${reading(advice)}`;
}

/** A line that sets a routine as it was before a change beside how it reads now. */
function ChangeNote({
  before,
  now,
}: {
  readonly before: RoutineAdvice;
  readonly now: RoutineAdvice;
}): ReactElement {
  return (
    <p className="change-note">
      Before your change: {summaryOf(before)}. Now: {summaryOf(now)}.
    </p>
  );
}

// The "Try another time or mode" form for one routine. Both buttons post the same fields; the
// `change` value ("time" or "mode") says which of the two the family asked to try.
function WhatIfForm({
  advice,
  target,
}: {
  readonly advice: RoutineAdvice;
  readonly target: WhatIfTarget;
}): ReactElement {
  // Field ids carry the routine id, so several forms on one page keep their labels apart.
  const id = `whatif-${advice.routineId}`;
  // The start time is pre-filled with the cleaner time when the advice found one, and with the
  // routine's own start otherwise. An empty mode value means "Not set".
  return (
    <details className="whatif">
      <summary>Try another time or mode</summary>
      <form method="post" action={target.action}>
        <input type="hidden" name="formToken" value={target.formToken} />
        <input type="hidden" name="routineId" value={advice.routineId} />
        {Object.entries(target.keep ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="field">
          <label htmlFor={`${id}-start`}>Start time</label>
          <input
            id={`${id}-start`}
            name="newStart"
            type="time"
            defaultValue={advice.window?.start ?? advice.start}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-mode`}>How you travel or move</label>
          <select id={`${id}-mode`} name="newMode" defaultValue={advice.mode ?? ''}>
            <option value="">Not set</option>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </option>
            ))}
          </select>
        </div>
        <p className="actions">
          <button className="button" type="submit" name="change" value="time">
            Try this time
          </button>
          <button className="link-button" type="submit" name="change" value="mode">
            Try this mode
          </button>
        </p>
      </form>
    </details>
  );
}

/** One routine of the day: what to do, why, when it is cleaner, and how to protect against the air. */
export function RoutineItem({
  advice,
  weekday,
  whatIf,
  before,
  noAir = false,
}: {
  readonly advice: RoutineAdvice;
  readonly weekday: Weekday;
  readonly whatIf?: WhatIfTarget | undefined;
  readonly before?: RoutineAdvice | undefined;
  /** True when there is no air data, so no decision can be given yet. */
  readonly noAir?: boolean;
}): ReactElement {
  const title = `${advice.memberLabel}: ${KIND_LABEL[advice.kind].toLowerCase()}`;
  // Three shapes, in order: a routine that does not happen on this weekday gets a one-line
  // note; with no air data only its time is listed; otherwise the full advice follows below.
  if (!advice.scheduled) {
    return (
      <li className="routine routine--off">
        <h4>{title}</h4>
        <p>Not on {WEEKDAY_LONG[weekday]}s.</p>
      </li>
    );
  }
  if (noAir) {
    return (
      <li className="routine" id={`routine-${advice.routineId}`} tabIndex={-1}>
        <h4>{title}</h4>
        <p className="routine-when">
          {advice.start}, {String(advice.minutes)} minutes
        </p>
        <p>No air data, so there is no advice for this routine yet. Try again in a few minutes.</p>
      </li>
    );
  }
  const { window } = advice;
  // The id and tabIndex -1 let a link to #routine-<id> land on this routine and focus it. The
  // level badge is left out when the routine's hours have no data. The "before" note, the
  // cleaner time, the protection list and the what-if form each appear only when there is
  // something to show.
  return (
    <li className="routine" id={`routine-${advice.routineId}`} tabIndex={-1}>
      <h4>{title}</h4>
      <p className="routine-when">
        {advice.start}, {String(advice.minutes)} minutes
        {advice.mode === undefined ? '' : `, ${MODE_LABEL[advice.mode].toLowerCase()}`}
      </p>
      <p>
        <DecisionTag decision={advice.decision} />{' '}
        {advice.level === null ? null : (
          <BandBadge band={advice.level} value={advice.pm25 ?? undefined} />
        )}
      </p>
      {before === undefined ? null : <ChangeNote before={before} now={advice} />}
      <p>
        {advice.reason.text} Source: <SourceLink source={advice.reason.source} />.
      </p>
      {window === undefined ? null : (
        <p>
          Cleaner time: {window.start} to {window.end}, PM2.5 about {String(window.pm25)} (
          {BAND_LABEL[window.level]}).
        </p>
      )}
      {advice.protection.length > 0 ? (
        <>
          <p className="label">How to protect against the air</p>
          <ul>
            {advice.protection.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p>{advice.impact.text}</p>
      {whatIf === undefined ? null : <WhatIfForm advice={advice} target={whatIf} />}
    </li>
  );
}
