'use client';

import { useRouter } from 'next/navigation';
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

/** Fills in the place from the device. It needs script, so it stays hidden until the page has loaded. */
export function LocationButton(): ReactElement {
  const ready = useSyncExternalStore(noSubscription, canLocate, cannotLocateOnServer);
  const [message, setMessage] = useState('');
  const router = useRouter();

  function locate(): void {
    setMessage('Finding your location.');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = round1(position.coords.latitude);
        const lon = round1(position.coords.longitude);
        router.push(`/?lat=${lat}&lon=${lon}#ask-title`);
      },
      () => {
        setMessage('We could not get your location. Type your place instead.');
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <>
      <button className="link-button" type="button" onClick={locate} hidden={!ready}>
        Use my location
      </button>
      <span role="status" className="small">
        {message}
      </span>
    </>
  );
}
