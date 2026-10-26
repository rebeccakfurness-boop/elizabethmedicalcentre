import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ageFrom, formatDate, formatIDR, initials } from '@/lib/format';
import type { Patient } from '@/lib/patients';

/** The top of a patient card, shared by the staff dashboard and the patient portal. */
export function PatientCardHeader({
  patient,
  familyName,
  familyHref,
  balance,
  actions,
}: {
  patient: Patient;
  familyName: string;
  familyHref?: string;
  balance?: number | null;
  actions?: React.ReactNode;
}) {
  const age = ageFrom(patient.date_of_birth);
  return (
    <section className="relative overflow-hidden rounded-3xl bg-teal p-6 text-cream shadow-soft sm:p-8">
      <Logo variant="brandmark" className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10" />
      <div className="relative flex flex-wrap items-start gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-cream font-headline text-2xl font-extrabold text-teal" aria-hidden="true">
          {initials(patient.first_name, patient.last_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-cream/75">Patient card · {patient.mrn}</p>
          <h1 className="mt-1 font-headline text-3xl font-extrabold leading-tight">
            {patient.first_name} {patient.last_name}
          </h1>
          <p className="mt-1 text-sm text-cream/85">
            {age != null ? `${age} years · ` : ''}
            {patient.date_of_birth ? `Born ${formatDate(patient.date_of_birth)}` : 'Date of birth not recorded'}
            {patient.sex ? ` · ${patient.sex[0].toUpperCase()}${patient.sex.slice(1)}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {patient.allergies ? <span className="pill bg-red-100 text-red-800">⚠ Allergies</span> : null}
            <span className="pill bg-white/15 text-cream">{patient.insurer_name ? `Insured · ${patient.insurer_name}` : 'Self-pay'}</span>
            {patient.status === 'inactive' ? <span className="pill bg-stone-200 text-stone-700">Inactive</span> : null}
            <span className="pill bg-white/15 text-cream">
              Family:&nbsp;
              {familyHref ? <Link href={familyHref} className="underline">{familyName}</Link> : familyName}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          {balance != null ? (
            <div className="text-right">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-cream/75">Family balance</p>
              <p className={`font-headline text-2xl font-extrabold ${balance > 0 ? 'text-offwhite' : 'text-cream'}`}>{formatIDR(balance)}</p>
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
