// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AskForm } from '@/components/ask-form';
import { ChoosePlace } from '@/components/choose-place';
import { HouseholdForm } from '@/components/household-form';
import { LiveStripView } from '@/components/live-strip';
import { SampleList } from '@/components/sample-list';
import { SAMPLES } from '@/core/profile/samples';

import { violationsIn } from '../helpers/axe';

// The location button reads the router, which only exists inside a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('home page components', () => {
  it('have no accessibility violations: sample list, live strip and own-words form', async () => {
    const cards = SAMPLES.map(({ id, title, summary }) => ({ id, title, summary }));
    expect(await violationsIn(<SampleList samples={cards} />)).toEqual([]);
    const html = renderToStaticMarkup(<SampleList samples={cards} />);
    expect(html.match(/href="\/plan\/sample\/s\d"/g)).toHaveLength(6);

    const now = { kind: 'now', aqi: 312, band: 'very_poor', dataHour: '2026-11-21T21:00' } as const;
    expect(await violationsIn(<LiveStripView strip={now} />)).toEqual([]);
    const down = { kind: 'unavailable' } as const;
    expect(await violationsIn(<LiveStripView strip={down} />)).toEqual([]);

    const ask = (
      <AskForm formToken="a.b" defaults={{ text: '', place: '' }} exampleHref="/?example=s1" />
    );
    expect(await violationsIn(ask)).toEqual([]);
    const askHtml = renderToStaticMarkup(ask);
    expect(askHtml).toContain('maxLength="1500"');
    expect(askHtml).toContain('Make my plan');
    expect(askHtml).toContain('Saans stores nothing.');
  });

  it('says what the live strip shows, in the agreed words', () => {
    const now = { kind: 'now', aqi: 312, band: 'very_poor', dataHour: '2026-11-21T21:00' } as const;
    const text = renderToStaticMarkup(<LiveStripView strip={now} />).replace(/<[^>]+>/g, '');
    expect(text).toContain('Delhi now: AQI 312, Very Poor');
    expect(text).toContain('CPCB 24-hour method, model estimate');
    expect(text).toContain('Data hour 21:00 IST');
    expect(text).toContain('Open-Meteo CAMS');
  });
});

describe('household form', () => {
  it('has no violations, with and without mistakes', async () => {
    const clean = { values: {}, errors: [] };
    expect(await violationsIn(<HouseholdForm state={clean} formToken="a.b" />)).toEqual([]);
    const withErrors = {
      values: { place: 'Pune', m1_label: 'Son' },
      errors: [
        { field: 'm1_age', message: 'Choose an age group for Son.' },
        { field: 'place', message: 'Type the place you live in.' },
      ],
    };
    const form = <HouseholdForm state={withErrors} formToken="a.b" />;
    expect(await violationsIn(form)).toEqual([]);
    const html = renderToStaticMarkup(form);
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="#f-m1_age"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('autoComplete="address-level2"');
  });

  it('has no violations in the place chooser', async () => {
    const options = [
      { name: 'Rampur', admin1: 'Uttar Pradesh', lat: 28.8, lon: 79 },
      { name: 'Rampur', admin1: 'Himachal Pradesh', lat: 31.5, lon: 77.6 },
    ];
    const chooser = (
      <ChoosePlace options={options} action="/ask" formToken="a.b" text="hello" keep={{}} />
    );
    expect(await violationsIn(chooser)).toEqual([]);
  });
});
