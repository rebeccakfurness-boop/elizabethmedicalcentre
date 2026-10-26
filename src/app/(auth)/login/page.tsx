import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LoginForm } from '@/components/auth/LoginForm';
import { patientLogin } from '@/app/actions/auth';

export const metadata = { title: 'Patient login – The Doctors' };

export default async function PatientLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-teal p-8 text-cream lg:p-14">
        <Link href="/" className="font-label text-xs font-bold uppercase tracking-[0.14em] text-cream/80 hover:text-cream">
          ← Back to website
        </Link>
        <div className="my-12">
          <Logo variant="logo-variation" className="w-64 max-w-full lg:w-96" title="The Doctors – Elizabeth Medical Centre" />
        </div>
        <p className="max-w-md text-cream/90">
          View your family&rsquo;s patient cards, invoices and insurance claims, and pay your bill online.
        </p>
      </section>
      <section className="flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md">
          <p className="card-title">Patient portal</p>
          <h1 className="page-title mt-2">Patient login</h1>
          <p className="mb-8 mt-2 text-ink-soft">Sign in with the email and password the clinic sent you.</p>
          <LoginForm action={patientLogin} next={next} submitLabel="Sign in" tone="clay" />
          <p className="mt-6 text-sm text-ink-soft">
            Don&rsquo;t have a login yet, or forgotten your password? Ask at reception and we&rsquo;ll set one up for you.
          </p>
        </div>
      </section>
    </main>
  );
}
