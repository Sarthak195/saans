// The community page for a housing society, school or office: what to do today, the best time
// outdoors, and a notice to send round. Components layer: it renders what the core's community
// plan holds, and the notice text arrives already written.
import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { CommunityPlan, Plan } from '@/core/plan/types';
import type { CommunityKind } from '@/core/types';
import type { WrittenText } from '@/server/genai';

import { CopyButton } from './copy-button';
import { SMOG_DAY_LABEL } from './copy';
import { withQuery } from '@/core/format';
import { ReasonLine } from './source-link';

// The label for each kind of community, in the order the audience links are listed.
const KIND_NAME: Record<CommunityKind, string> = {
  society: 'Housing society',
  school: 'School',
  office: 'Office',
};

/** The link that shares a notice. It carries the notice text and nothing else: never a plan link. */
export function whatsappLink(notice: string): string {
  // The text is percent-encoded so spaces, line breaks and symbols survive inside the address.
  return `https://wa.me/?text=${encodeURIComponent(notice)}`;
}

// Links to switch between the three audiences; the current one is marked for screen readers.
function KindLinks({
  base,
  current,
}: {
  readonly base: string;
  readonly current: CommunityKind;
}): ReactElement {
  return (
    <nav aria-label="Who this is for">
      <ul className="day-links">
        {(Object.keys(KIND_NAME) as CommunityKind[]).map((kind) => (
          <li key={kind}>
            <a
              className="link-button"
              href={withQuery(base, { kind })}
              aria-current={kind === current ? 'page' : undefined}
            >
              {KIND_NAME[kind]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** What the "Write it with Gemini" button posts: where, the audience and the language to write in. */
export interface WriteForm {
  /** Where the form posts. */
  readonly action: string;
  /** The signed form token the route checks before it accepts the post (SECURITY.md). */
  readonly formToken: string;
  readonly kind: CommunityKind;
  readonly lang: string;
  /** The air setting the page was opened with, such as 'smog-day', or undefined. */
  readonly air: string | undefined;
}

/** What a society, school or office can do today, and a notice it can send round. */
export function CommunityView({
  plan,
  community,
  base,
  planHref,
  notice,
  writeForm,
  smogDay,
}: {
  readonly plan: Plan;
  readonly community: CommunityPlan;
  /** This page's own path, for the audience links and the notice link. */
  readonly base: string;
  readonly planHref: string;
  /** The notice as written in code, or the sealed one from the notice step. */
  readonly notice: WrittenText;
  /** Left out once a notice has been written, so a second press does not spend more of the allowance. */
  readonly writeForm?: WriteForm | undefined;
  readonly smogDay: boolean;
}): ReactElement {
  const { bestOutdoorWindow: window, aggregate } = community;
  // `window` is null when no outdoor slot has a usable time, and the section says so. The notice
  // is marked with its own language (`notice.lang`). Its byline says whether Gemini or the code
  // wrote it, with the note (if any) after it. The share link holds only the notice text. The
  // write form is drawn only when the page offers it, and it carries the audience, language and
  // air setting so the new notice matches this page.
  return (
    <>
      <h1 id="plan-title" tabIndex={-1}>
        Community view for {plan.day.label}
      </h1>
      <p className="place-line">
        {plan.place.name}, {plan.place.admin1}
      </p>
      {smogDay ? <p className="notice notice--recorded">{SMOG_DAY_LABEL}</p> : null}
      <KindLinks base={base} current={community.kind} />

      <section aria-labelledby="actions-title" className="section">
        <h2 id="actions-title">What to do today</h2>
        <ul className="advice">
          {community.actions.map((action) => (
            <li key={action.id}>
              <h3>{action.title}</h3>
              <p>{action.body}</p>
              <ReasonLine reason={action.reason} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="window-title" className="section">
        <h2 id="window-title">Best time outdoors</h2>
        {window === null ? (
          <p>No outdoor slot is listed for this community, so there is no best time to show.</p>
        ) : (
          <p>
            {window.start} to {window.end}, PM2.5 about {String(window.pm25)} (
            {BAND_LABEL[window.level]}).
          </p>
        )}
        {aggregate === undefined ? null : <p>{aggregate.text}</p>}
      </section>

      <section id="notice" aria-labelledby="notice-title" className="section">
        <h2 id="notice-title">A notice to send round</h2>
        <p lang={notice.lang} className="notice-text">
          {notice.text}
        </p>
        <p className="small">
          {notice.by === 'gemini'
            ? 'Written by Gemini from your plan'
            : 'Written by Saans from your plan'}
          .{notice.note === undefined ? '' : ` ${notice.note}`}
        </p>
        <p className="actions">
          <CopyButton text={notice.text} />
          <a className="link-button" href={whatsappLink(notice.text)} rel="noopener noreferrer">
            Share on WhatsApp
          </a>
        </p>
        <p className="small">
          The WhatsApp message holds only the notice text, not a link to your family&apos;s plan.
        </p>
        {writeForm === undefined ? null : (
          <form method="post" action={writeForm.action}>
            <input type="hidden" name="formToken" value={writeForm.formToken} />
            <input type="hidden" name="kind" value={writeForm.kind} />
            <input type="hidden" name="lang" value={writeForm.lang} />
            {writeForm.air === undefined ? null : (
              <input type="hidden" name="air" value={writeForm.air} />
            )}
            <p className="small">
              Gemini rewrites this notice in its own words. It is sent the plan&apos;s readings and
              times, with no names, and its text is checked against the plan before it is shown.
            </p>
            <p>
              <button className="button" type="submit">
                Write it with Gemini
              </button>
            </p>
          </form>
        )}
      </section>

      <p>
        <a href={planHref}>Back to the plan</a>
      </p>
    </>
  );
}
