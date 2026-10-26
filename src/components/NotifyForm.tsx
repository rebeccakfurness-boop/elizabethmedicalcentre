'use client';

import { useState } from 'react';

// Opening-notification sign-up. Posts to a Formspree-compatible endpoint; until
// NEXT_PUBLIC_NOTIFY_FORM_ENDPOINT is set, nothing is sent anywhere.
const ENDPOINT = process.env.NEXT_PUBLIC_NOTIFY_FORM_ENDPOINT;

export function NotifyForm() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ENDPOINT) {
      setStatus('Sign-ups aren’t connected yet — please check back soon.');
      return;
    }
    const form = event.currentTarget;
    setBusy(true);
    setStatus('Sending…');
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(res.statusText);
      form.reset();
      setStatus('Thank you — we’ll let you know when we open.');
    } catch {
      setStatus('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="notify" onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor="email">
        Email address
      </label>
      <input id="email" name="email" type="email" autoComplete="email" placeholder="Your email address" required />
      <input type="hidden" name="_subject" value="Opening notification sign-up" />
      <button type="submit" disabled={busy}>
        Notify me
      </button>
      <p className="notify__status" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
