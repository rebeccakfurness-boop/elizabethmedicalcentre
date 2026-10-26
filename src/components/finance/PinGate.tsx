'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { unlockBudget } from '@/app/actions/finance';

export function PinGate() {
  const [state, action, pending] = useActionState(unlockBudget, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <div className="mx-auto mt-10 max-w-sm text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal text-2xl text-cream" aria-hidden="true">🔒</div>
      <h1 className="page-title">Finance is locked</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">Enter the budget PIN to open the budget tracker, bills and bank statements. It locks again after 30 minutes.</p>
      <form action={action} className="space-y-3">
        <label className="sr-only" htmlFor="pin">PIN</label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4,8}"
          maxLength={8}
          required
          autoFocus
          className="input text-center font-mono text-2xl tracking-[0.5em]"
        />
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        <button className="btn-primary w-full py-3" disabled={pending}>{pending ? 'Checking…' : 'Unlock'}</button>
      </form>
    </div>
  );
}
