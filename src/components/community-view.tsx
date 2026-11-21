import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { CommunityPlan, Plan } from '@/core/plan/types';
import type { CommunityKind } from '@/core/types';
import type { WrittenText } from '@/server/genai';

import { CopyButton } from './copy-button';
import { SMOG_DAY_LABEL } from './copy';
import { withQuery } from './links';
import { ReasonLine } from './source-link';

const KIND_NAME: Record<CommunityKind, string> = {
  society: 'Housing society',
  school: 'School',
  office: 'Office',
};

/** The link that shares a notice. It carries the notice text and nothing else: never a plan link. */
export function whatsappLink(notice: string): string {
  return `https://wa.me/?text=${encodeURIComponent(notice)}`;
}

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

/** What a society, school or office can do today, and a notice it can send round. */
export function CommunityView({
  plan,
  community,
  base,
  planHref,
  notice,
  smogDay,
}: {
  readonly plan: Plan;
  readonly community: CommunityPlan;
  /** This page's own path, for the audience links and the notice link. */
  readonly base: string;
  readonly planHref: string;
  readonly notice?: WrittenText | undefined;
  readonly smogDay: boolean;
}): ReactElement {
  const { bestOutdoorWindow: window, aggregate } = community;
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
        {notice === undefined ? (
          <p>
            <a
              className="link-button"
              href={withQuery(base, { kind: community.kind, notice: '1' })}
            >
              Write a notice for my building
            </a>
          </p>
        ) : (
          <>
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
              The WhatsApp message holds only the notice text, not a link to your family&apos;s
              plan.
            </p>
          </>
        )}
      </section>

      <p>
        <a href={planHref}>Back to the plan</a>
      </p>
    </>
  );
}
