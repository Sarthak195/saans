'use client';

// A button that copies a notice to the clipboard. React client component. It stays hidden
// until the browser reports a clipboard, so a page without script shows no dead button.

import { useState, useSyncExternalStore, type ReactElement } from 'react';

// The three functions below feed useSyncExternalStore. Nothing about the clipboard changes while
// the page is open, so there is nothing to subscribe to.
function noSubscription(): () => void {
  return () => undefined;
}
// Browser snapshot: true when the browser offers a clipboard.
function canCopy(): boolean {
  return 'clipboard' in navigator;
}
// Server snapshot: false, so the server renders the button hidden and the browser reveals it.
function cannotCopyOnServer(): boolean {
  return false;
}

/**
 * Copies a notice. It needs script, so it stays hidden until the page has loaded; the text is on
 * the page either way. The result is written to a status line, so a screen reader announces it.
 */
export function CopyButton({ text }: { readonly text: string }): ReactElement {
  const ready = useSyncExternalStore(noSubscription, canCopy, cannotCopyOnServer);
  const [message, setMessage] = useState('');

  // Clipboard access can be refused, so a failure tells the family to copy the text by hand.
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
