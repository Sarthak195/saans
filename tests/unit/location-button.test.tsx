// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationButton } from '@/components/location-button';

// React only runs effects and state updates inside act() when told it is in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLFormElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('form');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'geolocation');
});

function stubLocation(run: (ok: PositionCallback, fail: PositionErrorCallback) => void): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: run },
  });
}

function fields(): Record<string, string> {
  return Object.fromEntries(
    [...new FormData(host)].map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );
}

describe('LocationButton', () => {
  it('writes the rounded coordinates into hidden form fields, not into the page address', () => {
    const before = window.location.href;
    stubLocation((ok) => {
      ok({ coords: { latitude: 28.6139, longitude: 77.209 } } as GeolocationPosition);
    });
    act(() => {
      root.render(<LocationButton />);
    });
    expect(fields()).toEqual({});

    const button = host.querySelector('button');
    if (button === null) throw new Error('no button');
    act(() => {
      button.click();
    });

    expect(fields()).toEqual({ lat: '28.6', lon: '77.2' });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('rounded to about 11 km');
    expect(window.location.href).toBe(before);
  });

  it('sends a location given on an earlier page, and replaces it rather than adding a second', () => {
    stubLocation((ok) => {
      ok({ coords: { latitude: 19.07, longitude: 72.88 } } as GeolocationPosition);
    });
    act(() => {
      root.render(<LocationButton initial={{ lat: '12.3', lon: '76.6' }} />);
    });
    expect(fields()).toEqual({ lat: '12.3', lon: '76.6' });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Using your location');

    const button = host.querySelector('button');
    if (button === null) throw new Error('no button');
    act(() => {
      button.click();
    });
    // One pair only: the server would read two values of one field as a single joined value.
    expect([...new FormData(host).keys()]).toEqual(['lat', 'lon']);
    expect(fields()).toEqual({ lat: '19.1', lon: '72.9' });
  });

  it('leaves the fields out and says so when the device will not share a location', () => {
    stubLocation((_ok, fail) => {
      fail({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    act(() => {
      root.render(<LocationButton />);
    });
    const button = host.querySelector('button');
    if (button === null) throw new Error('no button');
    act(() => {
      button.click();
    });
    expect(fields()).toEqual({});
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Type your place');
  });
});
