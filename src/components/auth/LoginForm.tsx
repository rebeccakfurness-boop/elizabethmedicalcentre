'use client';

import { useActionState } from 'react';
import type { FormState } from '@/app/actions/auth';

export function LoginForm({
  action,
  next,
  submitLabel,
  tone = 'teal',
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  next?: string;
  submitLabel: string;
  tone?: 'teal' | 'clay';
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
      <button type="submit" disabled={pending} className={`${tone === 'clay' ? 'btn-clay' : 'btn-primary'} w-full py-3 text-base`}>
        {pending ? 'Signing in…' : submitLabel}
      </button>
    </form>
  );
}
