import Link from 'next/link';
import { createFirstSuperAdmin, setupDone } from '@/app/actions/setup';
import { Logo } from '@/components/Logo';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field } from '@/components/ui/Field';

export const metadata = { title: 'First-time setup – The Doctors', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const done = await setupDone();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md">
        <div className="mx-auto mb-8 w-44 text-teal"><Logo variant="logo-combination" title="The Doctors – Elizabeth Medical Centre" /></div>
        <div className="card">
          <h1 className="font-headline text-xl font-extrabold text-pulse">First-time setup</h1>
          {done ? (
            <p className="mt-2 text-sm text-ink-soft">
              Setup is complete. <Link href="/staff/login" className="text-teal underline">Go to the staff login</Link>.
            </p>
          ) : (
            <>
              <p className="mb-5 mt-1 text-sm text-ink-soft">Create the first super admin account. This page closes as soon as one exists.</p>
              <ActionForm action={createFirstSuperAdmin} submitLabel="Create super admin" submitClassName="btn-clay w-full py-3">
                <Field label="Setup code" name="token" type="password" required />
                <Field label="Your name" name="name" required />
                <Field label="Email (your username)" name="email" type="email" required />
                <Field label="Password" name="password" type="password" required hint="At least 10 characters, with a letter and a number." />
                <Field label="Confirm password" name="confirm" type="password" required />
              </ActionForm>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
