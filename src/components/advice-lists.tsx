import type { ReactElement } from 'react';

import type { TransitOption } from '@/core/alternatives';
import type { Alternative, GrapNote, HomeAdvice } from '@/core/plan/types';
import type { Reason } from '@/core/plan/types';

import { withQuery } from './links';
import type { PlanContext } from './links';
import { SHARE_WARNING } from './copy';

function ReasonLine({ reason }: { readonly reason: Reason }): ReactElement {
  const { source } = reason;
  const title = source.status === 'APP' ? 'Saans rule' : source.title;
  return (
    <p className="small">
      Why: {reason.text} Source:{' '}
      {source.url === '' ? (
        title
      ) : (
        <a href={source.url} rel="noopener noreferrer">
          {title}
        </a>
      )}
      .
    </p>
  );
}

function AdviceItem({ item }: { readonly item: HomeAdvice }): ReactElement {
  return (
    <li>
      <h4>{item.title}</h4>
      <p>{item.body}</p>
      {item.impact === undefined ? null : <p>{item.impact.text}</p>}
      <ReasonLine reason={item.reason} />
    </li>
  );
}

/** Advice for the home: safety first, then the rest, and the myths to drop in their own list. */
export function HomeSection({ home }: { readonly home: readonly HomeAdvice[] }): ReactElement {
  const safety = home.filter((h) => h.safety === true);
  const myths = home.filter((h) => h.myth === true);
  const rest = home.filter((h) => h.safety !== true && h.myth !== true);
  return (
    <section id="home" aria-labelledby="home-title" className="section">
      <h2 id="home-title">At home</h2>
      {home.length === 0 ? <p>Nothing needs changing at home today.</p> : null}
      {safety.length > 0 ? (
        <>
          <h3>Safety first</h3>
          <ul className="advice">
            {safety.map((item) => (
              <AdviceItem key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : null}
      {rest.length > 0 ? (
        <>
          <h3>What to do</h3>
          <ul className="advice">
            {rest.map((item) => (
              <AdviceItem key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : null}
      {myths.length > 0 ? (
        <>
          <h3>Myths to drop</h3>
          <ul className="advice">
            {myths.map((item) => (
              <AdviceItem key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/** Lower-emission options for the family's trips, with the real operators where there are any. */
export function AlternativesSection({
  alternatives,
  transit,
}: {
  readonly alternatives: readonly Alternative[];
  readonly transit: readonly TransitOption[];
}): ReactElement {
  return (
    <section id="alternatives" aria-labelledby="alternatives-title" className="section">
      <h2 id="alternatives-title">Cleaner ways to travel</h2>
      {alternatives.length === 0 ? (
        <p>No trip in this plan has a cleaner option to suggest.</p>
      ) : null}
      {alternatives.length > 0 ? (
        <ul className="advice">
          {alternatives.map((item) => (
            <li key={item.id}>
              <h4>{item.title}</h4>
              <p>{item.body}</p>
              <p>{item.impact.text}</p>
              <ReasonLine reason={item.reason} />
            </li>
          ))}
        </ul>
      ) : null}
      {transit.length > 0 ? (
        <>
          <h3>Public transport near you</h3>
          <ul>
            {transit.map((option) => (
              <li key={option.id}>
                <a href={option.url} rel="noopener noreferrer">
                  {option.name}
                </a>
                , run by {option.operator}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function GrapSection({ grap }: { readonly grap: GrapNote | null }): ReactElement | null {
  if (grap === null) return null;
  return (
    <section id="grap" aria-labelledby="grap-title" className="section">
      <h2 id="grap-title">GRAP in Delhi NCR</h2>
      <p>{grap.text}</p>
      <p className="small">
        Source:{' '}
        <a href={grap.source.url} rel="noopener noreferrer">
          {grap.source.title}
        </a>
        .
      </p>
    </section>
  );
}

/** Links to the other views of this plan, and how to share it. */
export function MoreSection({
  ctx,
  communityHref,
  editHref,
  shareable,
  smogDay,
}: {
  readonly ctx: PlanContext;
  readonly communityHref: string;
  readonly editHref: string;
  /** True for a plan whose link carries the family's profile. */
  readonly shareable: boolean;
  readonly smogDay: boolean;
}): ReactElement {
  return (
    <section id="more" aria-labelledby="more-title" className="section">
      <h2 id="more-title">More from this plan</h2>
      <ul className="plain-list">
        <li>
          <a href={communityHref}>See the view for a society, school or office</a>
        </li>
        <li>
          {smogDay ? (
            <a href={withQuery(ctx.base, { lang: ctx.keep.lang })}>Back to the plan for today</a>
          ) : (
            <a href={withQuery(ctx.base, { ...ctx.keep, air: 'smog-day' })}>
              See this plan on a recorded smog day
            </a>
          )}
        </li>
        <li>
          <a href={editHref}>Change the family&apos;s details</a>
        </li>
      </ul>
      {shareable ? (
        <p className="share-line">
          To share this plan, copy the address of this page. {SHARE_WARNING}
        </p>
      ) : null}
    </section>
  );
}
