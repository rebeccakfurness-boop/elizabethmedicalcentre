import { notFound } from 'next/navigation';
import { DrugSheet, LeafletSheet } from '@/components/clinical/Sheets';
import { PrintButton } from '@/components/clinical/PrintButton';
import { Logo } from '@/components/Logo';
import { isClinical } from '@/lib/auth';
import { getClinicSettings } from '@/lib/billing';
import { getPrescription, getPrescriptionItems } from '@/lib/clinical';
import { ageFrom, formatDate } from '@/lib/format';
import { getPatient } from '@/lib/patients';
import { audit, getCurrentUser } from '@/lib/session';
import { DRUGS_BY_CODE } from '@/clinical/drugs';
import { LEAFLETS_BY_SLUG } from '@/clinical/leaflets';

export const metadata = { title: 'Prescription – The Doctors' };

export default async function PrintPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const rx = await getPrescription(Number((await params).id));
  if (!user || !rx || rx.status === 'draft') notFound();
  const patient = await getPatient(rx.patient_id);
  if (!patient) notFound();
  // Clinical staff, or the patient's own family once issued.
  const allowed = isClinical(user.clinicalRole) || (user.role === 'patient' && user.familyId === patient.family_id && rx.status === 'issued');
  if (!allowed) notFound();
  await audit(user.id, 'print', 'prescription', rx.id);
  const [items, clinic] = await Promise.all([getPrescriptionItems([rx.id]), getClinicSettings()]);
  const age = ageFrom(patient.date_of_birth);
  const seen = new Set<string>();
  const drugSheets = items.filter((i) => i.drug_code && DRUGS_BY_CODE.has(i.drug_code) && !seen.has(i.drug_code) && seen.add(i.drug_code));

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <article className="sheet">
        <header className="mb-4 flex items-start justify-between border-b-2 border-teal pb-3">
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-clay">Prescription</p>
            <h1 className="font-headline text-2xl font-extrabold text-pulse">{patient.first_name} {patient.last_name}</h1>
            <p className="text-sm">{patient.mrn} · {patient.date_of_birth ? `DOB ${formatDate(patient.date_of_birth)}` : ''}{age != null ? ` (${age} years)` : ''}</p>
          </div>
          <div className="text-right text-xs">
            <Logo variant="logo-combination" className="mb-1 ml-auto w-28 text-teal" />
            <p>{clinic.address}</p>
            {clinic.phone ? <p>{clinic.phone}</p> : null}
          </div>
        </header>
        <p className={`mb-3 rounded-lg px-3 py-1.5 text-sm font-semibold ${patient.allergies ? 'bg-red-100 text-red-900' : 'bg-paper'}`}>
          Allergies: {patient.allergies ?? 'None known'}
        </p>
        <table className="mb-4 w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft"><th className="py-1">Medicine</th><th>Directions</th><th>Qty</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-line/60 align-top">
                <td className="py-2 font-semibold">{i.drug_name}</td>
                <td className="py-2">{i.dose}, {i.route}, {i.frequency}{i.duration ? ` for ${i.duration}` : ''}{i.instructions ? `. ${i.instructions}` : ''}</td>
                <td className="py-2">{i.quantity ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rx.notes ? <p className="mb-4 text-sm">{rx.notes}</p> : null}
        {rx.status === 'cancelled' ? <p className="mb-4 text-lg font-bold text-red-700">CANCELLED</p> : null}
        <div className="mt-8 flex justify-between text-sm">
          <div>
            <p className="font-semibold">{rx.prescriber_name}</p>
            {rx.registration_number ? <p className="text-xs">STR {rx.registration_number}</p> : null}
            <p className="mt-6 w-48 border-t border-ink pt-1 text-xs">Signature</p>
          </div>
          <p className="text-xs">Issued {rx.issued_at ? formatDate(rx.issued_at) : ''}</p>
        </div>
        <p className="mt-6 text-xs text-ink-soft">Information sheets for each medicine and your condition follow on the next pages.</p>
      </article>
      {drugSheets.map((i) => (
        <DrugSheet key={i.id} drug={DRUGS_BY_CODE.get(i.drug_code!)!} dosing={`${i.dose}, ${i.frequency}${i.duration ? ` for ${i.duration}` : ''}`} />
      ))}
      {rx.leaflet_slugs.map((s) => LEAFLETS_BY_SLUG.get(s)).filter((l) => !!l).map((l) => <LeafletSheet key={l!.slug} leaflet={l!} />)}
    </div>
  );
}
