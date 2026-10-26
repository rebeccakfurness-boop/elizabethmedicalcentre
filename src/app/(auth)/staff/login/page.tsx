import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LoginForm } from '@/components/auth/LoginForm';
import { staffLogin } from '@/app/actions/auth';

export const metadata = { title: 'Staff login – The Doctors', robots: { index: false } };

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 block w-44 text-teal">
          <Logo variant="logo-combination" title="The Doctors – Elizabeth Medical Centre" />
        </Link>
        <div className="card">
          <h1 className="font-headline text-xl font-extrabold text-pulse">Staff login</h1>
          <p className="mb-5 mt-1 text-sm text-ink-soft">For clinic staff and administrators.</p>
          <LoginForm action={staffLogin} next={next} submitLabel="Sign in" />
        </div>
      </div>
    </main>
  );
}
