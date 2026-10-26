import Link from 'next/link';
import { Logo } from '@/components/Logo';

/** Branded frame for the public booking pages. */
export function BookShell({ children, title, lede }: { children: React.ReactNode; title: string; lede?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-teal text-cream">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="The Doctors – Elizabeth Medical Centre home"><Logo variant="logo-combination" className="w-36 sm:w-44" /></Link>
          <Link href="/login" className="font-label text-xs font-bold uppercase tracking-[0.14em] text-cream/85 hover:text-cream">Patient login</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="card-title">Appointments</p>
        <h1 className="page-title mt-1">{title}</h1>
        {lede ? <div className="mb-8 mt-2 max-w-2xl text-ink-soft">{lede}</div> : null}
        {children}
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-soft">
        In an emergency call <strong>119</strong> or <strong>112</strong>. · <Link href="/" className="underline">The Doctors – Elizabeth Medical Centre</Link>
      </footer>
    </div>
  );
}
