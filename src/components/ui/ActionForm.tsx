'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/app/actions/auth';

/** Wraps a server action form: shows its error/success message and disables submit while pending. */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitClassName = 'btn-primary',
  className = 'space-y-4',
  resetOnSuccess = false,
  confirm,
  inline = false,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submitLabel: string;
  submitClassName?: string;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={inline ? 'inline-flex flex-wrap items-center gap-2' : className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className={inline ? 'contents' : 'flex flex-wrap items-center gap-3'}>
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? 'Working…' : submitLabel}
        </button>
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-teal">{state.ok}</p> : null}
      </div>
    </form>
  );
}
