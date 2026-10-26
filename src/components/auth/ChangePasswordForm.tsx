'use client';

import { useActionState } from 'react';
import { changePassword } from '@/app/actions/auth';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
      <button type="submit" className="btn-primary w-full py-3" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
