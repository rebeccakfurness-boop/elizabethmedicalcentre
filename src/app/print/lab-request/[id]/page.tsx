import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/clinical/PrintButton';
import { Logo } from '@/components/Logo';
import { isClinical } from '@/lib/auth';
import { getClinicSettings } from '@/lib/billing';
import { ageFrom, formatClinicTime, formatDate } from '@/lib/format';
import { getLabOrder } from '@/lib/labs';
import { getPatient } from '@/lib/patients';
import { audit, getCurrentUser } from '@/lib/session';
import { sql } from '@/lib/db';
import { LAB_TESTS_BY_CODE } from '@/clinical/labs';

export const metadata = { title: 'Lab request – The Doctors' };

export default async function PrintLabRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const order = await getLabOrder(Number((await params).id));
  if (!user || !order || !isClinical(user.clinicalRole)) notFound();
  const [patient, clinic, [orderer]] = await Promise.all([
    getPatient(order.patient_id),
    getClinicSettings(),
    sql<{ registration_number: string | null }>`SELECT registration_number FROM users WHERE id = ${order.ordered_by}`,
  ]);
  if (!patient) notFound();
  await audit(user.id, 'print', 'lab_order', order.id);
  const age = ageFrom(patient.date_of_birth);
  const tests = order.test_codes.map((c) => LAB_TESTS_BY_CODE.get(c)).filter((t) => !!t);

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <article className="sheet text-sm">
        <header className="mb-4 flex items-start justify-between border-b-2 border-teal pb-3">
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-clay">Laboratory request</p>
            <h1 className="font-headline text-2xl font-extrabold text-pulse">{patient.first_name} {patient.last_name}</h1>
            <p>{patient.mrn} · {patient.date_of_birth ? `DOB ${formatDate(patient.date_of_birth)}` : 'DOB unknown'}{age != null ? ` (${age} years)` : ''}{patient.sex ? ` · ${patient.sex}` : ''}</p>
            {patient.phone ? <p>Phone {patient.phone}</p> : null}
          </div>
          <div className="text-right text-xs">
            <Logo variant="logo-combination" className="mb-1 ml-auto w-28 text-teal" />
            <p>{clinic.address}</p>
            {clinic.phone ? <p>{clinic.phone}</p> : null}
            {clinic.email ? <p>{clinic.email}</p> : null}
          </div>
        </header>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <p><strong>To:</strong> {order.lab_name ?? 'Laboratory'}</p>
          <p className="text-right"><strong>Requested:</strong> {formatClinicTime(order.created_at)}</p>
          <p><strong>Urgency:</strong> {order.urgency === 'urgent' ? 'URGENT – same day please' : 'Routine'}</p>
          <p className="text-right">{order.fasting ? <strong>Fasting sample</strong> : 'Non-fasting'}</p>
        </div>
        {order.clinical_details ? <p className="mb-4 rounded-lg bg-paper px-3 py-2"><strong>Clinical details:</strong> {order.clinical_details}</p> : null}
        <table className="mb-4 w-full">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft"><th className="py-1">Test</th><th>Sample</th></tr></thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t!.code} className="border-b border-line/60"><td className="py-2 font-semibold">☐ {t!.name}</td><td className="py-2">{t!.sample}</td></tr>
            ))}
            {order.other_tests ? <tr className="border-b border-line/60"><td className="py-2 font-semibold">☐ {order.other_tests}</td><td></td></tr> : null}
          </tbody>
        </table>
        <p className="mb-6">Please email results to <strong>{clinic.email ?? 'the clinic'}</strong>{clinic.phone ? <> and phone <strong>{clinic.phone}</strong> with any critical result</> : null}. Reference: <strong>LAB-{order.id}</strong>.</p>
        <div className="mt-8 flex justify-between">
          <div>
            <p className="font-semibold">{order.ordered_by_name}</p>
            {orderer?.registration_number ? <p className="text-xs">STR {orderer.registration_number}</p> : null}
            <p className="mt-6 w-48 border-t border-ink pt-1 text-xs">Signature</p>
          </div>
        </div>
      </article>
    </div>
  );
}
