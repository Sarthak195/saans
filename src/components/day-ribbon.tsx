import type { ReactElement } from 'react';

import { BAND_LABEL } from '@/core/aqi';
import type { AirSummary, Window } from '@/core/plan/types';

import { bandClass, clockOf } from './format';

const FIRST_HOUR = 6;
const HOURS = 16;
const MARKER_SPAN = 4;

export interface RibbonMarker {
  /** Who and when, such as 'Son 17:00'. */
  label: string;
  /** 'HH:MM' start of the routine. */
  start: string;
}

interface PlacedMarker extends RibbonMarker {
  column: number;
  span: number;
  row: number;
}

/** Puts each marker over its starting hour, on the first line where it does not touch another. */
export function placeMarkers(markers: readonly RibbonMarker[]): PlacedMarker[] {
  const lineEnds: number[] = [];
  const placed: PlacedMarker[] = [];
  const sorted = [...markers].sort((a, b) => a.start.localeCompare(b.start));
  for (const marker of sorted) {
    const hour = Number(marker.start.slice(0, 2));
    if (hour < FIRST_HOUR || hour >= FIRST_HOUR + HOURS) continue;
    const column = hour - FIRST_HOUR + 1;
    const span = Math.min(MARKER_SPAN, HOURS - column + 1);
    let row = lineEnds.findIndex((end) => end <= column);
    if (row === -1) row = lineEnds.length;
    lineEnds[row] = column + span;
    placed.push({ ...marker, column, span, row: row + 1 });
  }
  return placed;
}

function inWindow(hour: number, window: Window | null): boolean {
  if (window === null) return false;
  const start = Number(window.start.slice(0, 2));
  const end = Math.ceil(Number(window.end.slice(0, 2)) + Number(window.end.slice(3, 5)) / 60);
  return hour >= start && hour < end;
}

/**
 * The day at a glance: one cell for every hour from 06:00 to 21:00, filled with its PM2.5 band.
 * It is a table so a screen reader reads it hour by hour; CSS lays it out as a strip.
 */
export function DayRibbon({
  hourly,
  dayLabel,
  markers,
  window,
}: {
  readonly hourly: AirSummary['hourly'];
  readonly dayLabel: string;
  readonly markers: readonly RibbonMarker[];
  readonly window: Window | null;
}): ReactElement {
  const placed = placeMarkers(markers);
  const cells = hourly.map((cell, index) => {
    const hour = Number(clockOf(cell.hour).slice(0, 2));
    return { ...cell, index, hour, win: inWindow(hour, window) };
  });
  const firstWin = cells.find((c) => c.win)?.index;
  const lastWin = cells.filter((c) => c.win).at(-1)?.index;

  return (
    <div className="ribbon-block">
      <p className="ribbon-title" aria-hidden="true">
        PM2.5 by the hour, {dayLabel}
      </p>
      <div
        className="ribbon"
        role="region"
        aria-label={`PM2.5 by the hour, ${dayLabel}. Scrolls sideways on a small screen.`}
        tabIndex={0}
      >
        {placed.length > 0 ? (
          <ul className="ribbon-markers" aria-label="Your routines on this day">
            {placed.map((m) => (
              <li
                key={`${m.label}-${m.start}`}
                data-col={m.column}
                data-span={m.span}
                data-row={m.row}
              >
                {m.label}
              </li>
            ))}
          </ul>
        ) : null}
        <table className="ribbon-table" role="table">
          <caption className="sr-only">PM2.5 by the hour, {dayLabel}</caption>
          <thead role="rowgroup">
            <tr role="row">
              {cells.map((c) => (
                <th key={c.hour} role="columnheader" scope="col" className="rb-hour">
                  {String(c.hour).padStart(2, '0')}
                  <span className="sr-only">:00</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr role="row">
              {cells.map((c) => {
                const tone = c.level === null ? 'none' : bandClass(c.level);
                const edge = [
                  c.win ? 'rb-win' : '',
                  c.index === firstWin ? 'rb-win-first' : '',
                  c.index === lastWin ? 'rb-win-last' : '',
                ];
                return (
                  <td
                    key={c.hour}
                    role="cell"
                    className={['rb-value', `band--${tone}`, ...edge].filter(Boolean).join(' ')}
                  >
                    <span className={c.index % 2 === 1 ? 'rb-pm rb-alt' : 'rb-pm'}>
                      {c.pm25 === null ? 'n/a' : String(c.pm25)}
                    </span>
                    <span className="sr-only">
                      , {c.level === null ? 'no data' : BAND_LABEL[c.level]}
                      {c.win ? ', in the cleaner window' : ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ribbon-note">
        Numbers are PM2.5 in micrograms per cubic metre. Colours use the CPCB PM2.5 bands as a
        yardstick, not as an official hourly AQI.
        {window === null
          ? ''
          : ` The outlined hours, ${window.start} to ${window.end}, are the cleanest stretch of the day.`}
      </p>
    </div>
  );
}
