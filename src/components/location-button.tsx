'use client';

import { useState, useSyncExternalStore, type ReactElement } from 'react';

function noSubscription(): () => void {
  return () => undefined;
}
function canLocate(): boolean {
  return 'geolocation' in navigator;
}
function cannotLocateOnServer(): boolean {
  return false;
}

/** Rounds to 0.1 degree (about 11 km) so the exact spot never leaves the browser. */
function round1(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/**
 * Fills in the place from the device. It needs script, so it stays hidden until the page has
 * loaded. The rounded coordinates go into hidden fields of the form around it, so they travel in
 * the POST body and never in an address that browsers and servers keep.
 */
export function LocationButton(): ReactElement {
  const ready = useSyncExternalStore(noSubscription, canLocate, cannotLocateOnServer);
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState<{ lat: string; lon: string } | undefined>(undefined);

  function locate(): void {
    setMessage('Finding your location.');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: round1(position.coords.latitude),
          lon: round1(position.coords.longitude),
        });
        setMessage(
          'Using your location, rounded to about 11 km. A place you type below is used instead.',
        );
      },
      () => {
        setCoords(undefined);
        setMessage('We could not get your location. Type your place instead.');
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <>
      {coords === undefined ? null : (
        <>
          <input type="hidden" name="lat" value={coords.lat} />
          <input type="hidden" name="lon" value={coords.lon} />
        </>
      )}
      <button className="link-button" type="button" onClick={locate} hidden={!ready}>
        Use my location
      </button>
      <span role="status" className="small">
        {message}
      </span>
    </>
  );
}
