'use client';

import { useState, useSyncExternalStore, type ReactElement } from 'react';

function noSubscription(): () => void {
  return () => undefined;
}
function canCopy(): boolean {
  return 'clipboard' in navigator;
}
function cannotCopyOnServer(): boolean {
  return false;
}

/** Copies a notice. It needs script, so it stays hidden until the page has loaded; the text is on the page either way. */
export function CopyButton({ text }: { readonly text: string }): ReactElement {
  const ready = useSyncExternalStore(noSubscription, canCopy, cannotCopyOnServer);
  const [message, setMessage] = useState('');

  function copy(): void {
    navigator.clipboard.writeText(text).then(
      () => {
        setMessage('Copied. You can paste the notice now.');
      },
      () => {
        setMessage('Your browser did not allow copying. Select the text above and copy it.');
      },
    );
  }

  return (
    <>
      <button className="button" type="button" onClick={copy} hidden={!ready}>
        Copy the notice
      </button>
      <span role="status" className="small">
        {message}
      </span>
    </>
  );
}
