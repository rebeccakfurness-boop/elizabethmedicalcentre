import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

export const metadata = { title: 'Change password – The Doctors' };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="card w-full max-w-sm">
        <h1 className="font-headline text-xl font-extrabold text-pulse">
          {user.mustChangePassword ? 'Choose your password' : 'Change password'}
        </h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          {user.mustChangePassword
            ? 'You signed in with a temporary password. Choose your own to continue.'
            : 'At least 10 characters, with a letter and a number.'}
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
