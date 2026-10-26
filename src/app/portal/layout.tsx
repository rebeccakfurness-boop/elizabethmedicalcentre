import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { Logo } from '@/components/Logo';
import { getFamily } from '@/lib/patients';
import { requirePatient } from '@/lib/session';

export const metadata = { title: 'Patient portal – The Doctors', robots: { index: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePatient();
  const family = await getFamily(user.familyId);
  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-teal text-cream">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/portal" className="w-36"><Logo variant="logo-combination" title="The Doctors – Elizabeth Medical Centre" /></Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden sm:inline">{family?.account_name}</span>
            <Link href="/account/password" className="hover:underline">Password</Link>
            <form action={logout}><button className="rounded-full bg-cream px-4 py-1.5 font-label text-xs font-bold text-pulse">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-ink-soft sm:px-6">
        Questions about your bill? Ask at reception or reply to your invoice email. Your information is kept private and only seen by the clinic team.
      </footer>
    </div>
  );
}
