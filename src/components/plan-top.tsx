import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { Plan, QuestionAnswer } from '@/core/plan/types';
import type { WrittenText } from '@/server/genai';

import { BandBadge } from './band';
import { bandClass } from './format';
import { withQuery } from './links';
import type { PlanContext } from './links';
import { LocationButton } from './location-button';

export function PlanHeader({
  plan,
  ctx,
  smogDay,
}: {
  readonly plan: Plan;
  readonly ctx: PlanContext;
  readonly smogDay: boolean;
}): ReactElement {
  return (
    <header className="plan-header">
      <h1 id="plan-title" tabIndex={-1}>
        Plan for {plan.day.label}, all times IST
      </h1>
      <p className="place-line">
        {plan.place.name}, {plan.place.admin1}
      </p>
      {plan.air.precaution === undefined ? null : (
        <p className="notice">
          A monitor near you reads worse than the forecast for the same hour:{' '}
          {BAND_LABEL[plan.air.precaution.stationLevel]} at the monitor,{' '}
          {BAND_LABEL[plan.air.precaution.modelLevel]} in the forecast. For the next few hours,
          today&apos;s advice uses the worse level.
        </p>
      )}
      {smogDay ? null : (
        <nav aria-label="Plan day">
          <ul className="day-links">
            {plan.days.map((day) => (
              <li key={day.relative}>
                <a
                  className="link-button"
                  href={withQuery(ctx.base, { ...ctx.keep, day: day.relative })}
                  aria-current={day.relative === plan.day.relative ? 'page' : undefined}
                >
                  {day.relative === 'today'
                    ? 'Today'
                    : day.relative === 'tomorrow'
                      ? 'Tomorrow'
                      : 'Day after'}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <details className="change-place">
        <summary>Not right? Change place</summary>
        <form method="post" action={`${ctx.actionBase}/place`}>
          <input type="hidden" name="formToken" value={ctx.formToken} />
          <div className="field">
            <label htmlFor="place-change">Place in India</label>
            <input
              id="place-change"
              name="place"
              type="text"
              autoComplete="address-level2"
              maxLength={80}
            />
          </div>
          <p className="actions">
            <LocationButton />
          </p>
          <p>
            <button className="button" type="submit">
              Plan for this place
            </button>
          </p>
        </form>
      </details>
    </header>
  );
}

export function JumpBar({
  hasAnswer,
  hasBriefing,
}: {
  readonly hasAnswer: boolean;
  readonly hasBriefing: boolean;
}): ReactElement {
  const links: [string, string][] = [
    ...(hasAnswer ? ([['#answer', 'Answer']] as [string, string][]) : []),
    ...(hasBriefing ? ([['#summary', 'In short']] as [string, string][]) : []),
    ['#air', 'Air today'],
    ['#timeline', 'Timeline'],
    ['#home', 'Home'],
    ['#alternatives', 'Alternatives'],
    ['#more', 'More'],
  ];
  return (
    <nav aria-label="On this page" className="jump-bar">
      <ul>
        {links.map(([href, label]) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function StatusLine({ text }: { readonly text: string | undefined }): ReactElement {
  // The region exists on every page so a screen reader announces text that arrives after an action.
  return (
    <p role="status" className="status-line">
      {text ?? ''}
    </p>
  );
}

/** The level chip comes from the day the answer speaks about, and is left out when that has no reading. */
export function AnswerCard({
  answer,
  question,
}: {
  readonly answer: QuestionAnswer;
  readonly question?: string | undefined;
}): ReactElement {
  const { level } = answer;
  return (
    <section
      id="answer"
      tabIndex={-1}
      aria-labelledby="answer-title"
      className={`answer answer--${level === null ? 'none' : bandClass(level)}`}
    >
      <h2 id="answer-title">Your answer</h2>
      {level === null ? null : (
        <p>
          <BandBadge band={level} />
        </p>
      )}
      {question === undefined || question === '' ? null : (
        <p className="small">You asked: {question}</p>
      )}
      <p className="answer-text">{answer.text}</p>
    </section>
  );
}

export function BriefingSection({
  briefing,
  action,
  formToken,
  keep,
}: {
  readonly briefing: WrittenText;
  readonly action: string;
  readonly formToken: string;
  readonly keep: Readonly<Record<string, string>>;
}): ReactElement {
  const source =
    briefing.by === 'gemini'
      ? 'Written by Gemini from your plan; every number checked by Saans'
      : 'Written by Saans from your plan';
  return (
    <section id="summary" tabIndex={-1} aria-labelledby="briefing-title" className="section">
      <h2 id="briefing-title">In short</h2>
      <p lang={briefing.lang}>{briefing.text}</p>
      <p className="small">
        {source}.{briefing.note === undefined ? '' : ` ${briefing.note}`}
      </p>
      <form method="post" action={action}>
        <input type="hidden" name="formToken" value={formToken} />
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="small">
          Gemini rewrites this summary in its own words. It is sent the plan&apos;s readings and
          times, with no names, and its text is checked against the plan before it is shown.
        </p>
        <p className="actions">
          <button className="button" type="submit" name="lang" value="en">
            Write it again with Gemini
          </button>
          <button className="button" type="submit" name="lang" value="hi">
            Explain in Hindi with Gemini
          </button>
        </p>
      </form>
    </section>
  );
}

/** A box for one more question about the plan, read by Gemini and answered from the plan's own numbers. */
export function AskSection({
  action,
  formToken,
  keep,
}: {
  readonly action: string;
  readonly formToken: string;
  readonly keep: Readonly<Record<string, string>>;
}): ReactElement {
  return (
    <section id="ask" tabIndex={-1} aria-labelledby="ask-title" className="section">
      <h2 id="ask-title">Ask about this plan</h2>
      <form method="post" action={action}>
        <input type="hidden" name="formToken" value={formToken} />
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="field">
          <label htmlFor="ask-text">Your question</label>
          <input
            id="ask-text"
            name="text"
            type="text"
            maxLength={300}
            autoComplete="off"
            aria-describedby="ask-hint"
            required
          />
          <p className="small" id="ask-hint">
            For example: can my son play at 6 pm, or what if she walks at 7 am. Your question is
            sent to Google&apos;s Gemini API to read it. Avoid names.
          </p>
        </div>
        <p>
          <button className="button" type="submit">
            Ask
          </button>
        </p>
      </form>
    </section>
  );
}
