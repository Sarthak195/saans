// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BandBadge, DecisionTag } from '@/components/band';
import { DayRibbon, placeMarkers } from '@/components/day-ribbon';
import { RoutineItem } from '@/components/routine-item';
import { SevereBanner } from '@/components/plan-day';
import { AnswerCard } from '@/components/plan-top';
import { BANDS } from '@/core/aqi/breakpoints';
import { DECISIONS } from '@/core/decision';
import { sampleById } from '@/core/profile/samples';
import { loadPlanView } from '@/server/plan-view';
import type { PlanView } from '@/server/plan-view';

import { airBody, jsonResponse } from '../helpers/air-body';
import { violationsIn } from '../helpers/axe';
import { DASHES } from '../helpers/plan';

// axe walks the whole document, which is slow for a long form on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

// The sample plan reads the clock for the air data it keeps, so the clock is fixed to the plan's own time.
const PLAN_NOW = new Date('2026-11-21T09:00:00+05:30');
beforeEach(() => {
  vi.setSystemTime(PLAN_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function sampleView(): Promise<PlanView> {
  // A fixed reply, so the plan never depends on a recording's date.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(airBody())));
  const sample = sampleById('s1');
  if (sample === undefined) throw new Error('no sample');
  const view = await loadPlanView({
    household: { ...sample.household, questionTarget: { routineId: 'play', aboutToday: true } },
    now: PLAN_NOW,
    day: 'today',
  });
  return view;
}

describe('band badge', () => {
  it.each(BANDS)('has no accessibility violations for %s', async (band) => {
    expect(await violationsIn(<BandBadge band={band} value={123} />)).toEqual([]);
  });

  it('draws a different aria-hidden shape for each band', () => {
    const shapes = BANDS.map((band) => {
      const html = renderToStaticMarkup(<BandBadge band={band} />);
      expect(html).toContain('aria-hidden="true"');
      return /<(circle|rect|polygon)[^>]*>/.exec(html)?.[0];
    });
    expect(new Set(shapes).size).toBe(6);
  });

  it('shows the decision as a word as well as a drawing', async () => {
    for (const decision of DECISIONS) {
      const html = renderToStaticMarkup(<DecisionTag decision={decision} />);
      expect(html).toContain('aria-hidden="true"');
      expect(html.replace(/<[^>]+>/g, '').length).toBeGreaterThan(3);
    }
    expect(await violationsIn(<DecisionTag decision="move" />)).toEqual([]);
  });
});

describe('day ribbon', () => {
  it('is an accessible table in a focusable scroll region with 16 hours', async () => {
    const { plan } = await sampleView();
    const ribbon = (
      <DayRibbon
        hourly={plan.air.hourly}
        dayLabel={plan.day.label}
        markers={plan.routines.map((r) => ({
          label: `${r.memberLabel} ${r.start}`,
          start: r.start,
        }))}
        window={plan.glance.best}
      />
    );
    expect(await violationsIn(ribbon)).toEqual([]);
    const html = renderToStaticMarkup(ribbon);
    expect(html).toContain(`PM2.5 by the hour, ${plan.day.label}`);
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html.match(/<th /g)).toHaveLength(16);
    expect(html.match(/<td /g)).toHaveLength(16);
    expect(html).toContain('rb-win-first');
  });

  it('places markers over their hour on separate lines when they would touch', () => {
    const placed = placeMarkers([
      { label: 'Son 17:00', start: '17:00' },
      { label: 'Mum 18:00', start: '18:00' },
      { label: 'Dad 05:00', start: '05:00' },
    ]);
    expect(placed.map((m) => [m.label, m.column, m.row])).toEqual([
      ['Son 17:00', 12, 1],
      ['Mum 18:00', 13, 2],
    ]);
  });
});

describe('answer card and routine item', () => {
  it('have no accessibility violations', async () => {
    const { plan } = await sampleView();
    expect(plan.answer).toBeDefined();
    if (plan.answer === undefined) return;
    const play = plan.routines.find((r) => r.routineId === 'play');
    if (play === undefined) throw new Error('no play routine');
    const card = <AnswerCard answer={plan.answer} question="Can he play?" />;
    expect(await violationsIn(card)).toEqual([]);
    const item = (
      <ol>
        <RoutineItem
          advice={play}
          weekday={plan.day.weekday}
          whatIf={{ action: '/plan/x/whatif', formToken: 'a.b' }}
          before={play}
        />
      </ol>
    );
    const html = renderToStaticMarkup(item);
    expect(html).toContain('Try another time or mode');
    expect(html).toContain('Before your change');
    expect(html).not.toMatch(DASHES);
    expect(
      await violationsIn(
        <section>
          <h3>Evening</h3>
          {item}
        </section>,
      ),
    ).toEqual([]);
  });

  it('shows a level chip on the answer only when the answer has a level', () => {
    const answer = { text: 'Yes.', numbers: [], shiftedToNextDay: false };
    const withLevel = renderToStaticMarkup(<AnswerCard answer={{ ...answer, level: 'poor' }} />);
    expect(withLevel).toContain('band--poor');
    const without = renderToStaticMarkup(<AnswerCard answer={{ ...answer, level: null }} />);
    expect(without).not.toContain('class="band');
    expect(without).toContain('answer--none');
  });

  it('words the severe banner as a consideration, not an order', () => {
    const html = renderToStaticMarkup(<SevereBanner />);
    expect(html).toContain('consider a well-fitted N95 or N99 mask; it may help on a short trip');
    expect(html).not.toMatch(/should wear|must wear/i);
  });

  it('links the reason to its source when there is a url', async () => {
    const { plan } = await sampleView();
    const withUrl = plan.routines.find((r) => r.reason.source.url !== '');
    if (withUrl === undefined) throw new Error('no routine with a source url');
    const html = renderToStaticMarkup(<RoutineItem advice={withUrl} weekday="mon" />);
    expect(html).toContain(`href="${withUrl.reason.source.url}"`);
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
