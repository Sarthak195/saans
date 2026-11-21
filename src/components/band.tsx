import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { Band } from '@/core/aqi';
import type { Decision } from '@/core/decision';

import { bandClass, DECISION_WORD } from './format';

// One shape per band, so the band is never carried by colour alone. Good is the calmest shape
// and Severe is a stop sign.
const SHAPE_POINTS: Record<Exclude<Band, 'good' | 'satisfactory'>, string> = {
  moderate: '8,2 15,14 1,14',
  poor: '8,1 15,8 8,15 1,8',
  very_poor: '4.5,2 11.5,2 15,8 11.5,14 4.5,14 1,8',
  severe: '5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5',
};

export function BandShape({ band }: { readonly band: Band }): ReactElement {
  return (
    <svg className="shape" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {band === 'good' ? (
        <circle cx="8" cy="8" r="7" fill="currentColor" />
      ) : band === 'satisfactory' ? (
        <rect x="1.5" y="1.5" width="13" height="13" fill="currentColor" />
      ) : (
        <polygon points={SHAPE_POINTS[band]} fill="currentColor" />
      )}
    </svg>
  );
}

/** The band as a word, an optional number and a shape, in the band's own colours. */
export function BandBadge({
  band,
  value,
}: {
  readonly band: Band;
  readonly value?: number | undefined;
}): ReactElement {
  return (
    <span className={`band band--${bandClass(band)}`}>
      <BandShape band={band} />
      <span>{BAND_LABEL[band]}</span>
      {value === undefined ? null : <span className="num">{String(value)}</span>}
    </span>
  );
}

const DECISION_PATH: Record<Decision, ReactElement> = {
  keep: <path d="M3 8.5 6.5 12 13 4" fill="none" stroke="currentColor" strokeWidth="2" />,
  lighten: <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" />,
  move: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  indoors: <path d="M2 8 8 2.5 14 8v6H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  essential: (
    <path
      d="M8 1.5 14 4v4.5c0 3-2.5 5-6 6-3.5-1-6-3-6-6V4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
};

/** What the plan advises for a routine: a word and a small drawing, never colour alone. */
export function DecisionTag({ decision }: { readonly decision: Decision }): ReactElement {
  return (
    <span className={`decision decision--${decision}`}>
      <svg className="shape" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {DECISION_PATH[decision]}
      </svg>
      <span>{DECISION_WORD[decision]}</span>
    </span>
  );
}
