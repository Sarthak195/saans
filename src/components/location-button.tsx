'use client';
// "Use my location": asks the browser for a position, rounds it, and puts it in hidden fields of
// the form around the button. Used on the front door, the household form and the change of place.

import { useState, useSyncExternalStore, type ReactElement } from 'react';

/** A device location as the form sends it: degrees rounded to one decimal, as text. */
export interface Coords {
  lat: string;
  lon: string;
}

// The line shown while a device location is held.
const USING =
  'Using your location, rounded to about 11 km. If you type a place, that is used instead.';

// Shown when the browser has not answered at all after NO_ANSWER_MS, usually because its
// permission prompt is still open or was closed without a choice.
const NO_ANSWER =
  'No location yet. Allow location for this site in your browser, or type your place instead.';
const NO_ANSWER_MS = 12_000;

// The button needs script and a browser that can locate. These three functions let React ask
// for that once on the client, while the server render keeps the button hidden.
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
 * Fills in the place from the device. The rounded coordinates go into hidden fields of the form
 * around it, so they travel in the body of the form post, never as plain values in an address.
 * `initial` is a location the family already gave on an earlier page; it is sent again unless
 * they ask for a new one, and pressing the button replaces it rather than adding a second pair.
 */
export function LocationButton({
  initial,
}: {
  readonly initial?: Coords | undefined;
} = {}): ReactElement {
  // False on the server and in a browser that cannot locate, so the button stays hidden there.
  const ready = useSyncExternalStore(noSubscription, canLocate, cannotLocateOnServer);
  // A location carried from an earlier page starts out in use, with the same line.
  const [message, setMessage] = useState(initial === undefined ? '' : USING);
  const [coords, setCoords] = useState<Coords | undefined>(initial);

  // Asks the browser once. Success sets the coordinates; an error clears them.
  function locate(): void {
    setMessage('Finding your location.');
    // The timeout below does not run while the browser's permission prompt is open, and Firefox
    // never answers a prompt that was closed without a choice, so after a while say what to do.
    const hint = window.setTimeout(() => {
      setMessage(NO_ANSWER);
    }, NO_ANSWER_MS);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(hint);
        // Rounded here in the browser, before anything is sent.
        setCoords({
          lat: round1(position.coords.latitude),
          lon: round1(position.coords.longitude),
        });
        setMessage(USING);
      },
      () => {
        window.clearTimeout(hint);
        // Denied, unavailable or timed out: the family can still type a place, so say that.
        setCoords(undefined);
        setMessage('We could not get your location. Type your place instead.');
      },
      // A fix up to ten minutes old is close enough at 11 km, and saves a slow new reading.
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  // The hidden fields exist only while a location is held, so a failed or cleared one sends none.
  // The button stays hidden until the browser says it can locate.
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
