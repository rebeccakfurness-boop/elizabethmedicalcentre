import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateMyContactDetails } from '@/app/actions/portal';
import { PatientCardHeader } from '@/components/patients/PatientCardHeader';
import { FromYourDoctor } from '@/components/portal/FromYourDoctor';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field } from '@/components/ui/Field';
import { getFamilyPrescriptions, getPatientPortalNotes, getPrescriptionItems } from '@/lib/clinical';
import { formatDate } from '@/lib/format';
import { getFamily, getPatient } from '@/lib/patients';
import { requirePatient } from '@/lib/session';

export default async function PortalPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePatient();
  const patient = await getPatient(Number((await params).id));
  if (!patient || patient.family_id !== user.familyId) notFound();
  const [family, familyNotes, familyRx] = await Promise.all([getFamily(patient.family_id), getPatientPortalNotes(patient.family_id), getFamilyPrescriptions(patient.family_id)]);
  const notes = familyNotes.filter((n) => n.patient_id === patient.id);
  const prescriptions = familyRx.filter((r) => r.patient_id === patient.id);
  const rxItems = await getPrescriptionItems(prescriptions.map((r) => r.id));

  return (
    <div className="space-y-6">
      <Link href="/portal" className="font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">← Back</Link>
      <PatientCardHeader patient={patient} familyName={family?.account_name ?? ''} />
      <FromYourDoctor notes={notes} prescriptions={prescriptions} items={rxItems} showNames={false} />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="card-title mb-3">Health summary</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink-soft">Allergies</dt><dd className={patient.allergies ? 'font-semibold text-red-800' : ''}>{patient.allergies ?? 'None recorded'}</dd></div>
            <div><dt className="text-ink-soft">Current medications</dt><dd>{patient.current_medications ?? 'None recorded'}</dd></div>
            <div><dt className="text-ink-soft">Blood type</dt><dd>{patient.blood_type ?? 'Not recorded'}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-soft">Something wrong or missing? Tell your doctor or reception and we&rsquo;ll update your record.</p>
        </section>
        <section className="card">
          <h2 className="card-title mb-3">Insurance</h2>
          {patient.insurer_name ? (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-ink-soft">Insurer</dt><dd>{patient.insurer_name}</dd></div>
              <div><dt className="text-ink-soft">Policy no.</dt><dd>{patient.insurance_policy_number ?? '—'}</dd></div>
              <div><dt className="text-ink-soft">Expiry</dt><dd>{formatDate(patient.insurance_expiry)}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-ink-soft">No insurance on file. If you have travel or health insurance, bring the details to reception and we can bill them directly.</p>
          )}
        </section>
        <section className="card md:col-span-2">
          <h2 className="card-title mb-3">Contact details</h2>
          <ActionForm action={updateMyContactDetails} submitLabel="Save my details">
            <input type="hidden" name="id" value={patient.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone / WhatsApp" name="phone" type="tel" defaultValue={patient.phone} />
              <Field label="Email" name="email" type="email" defaultValue={patient.email} />
              <Field label="Address in Lombok" name="address" defaultValue={patient.address} className="sm:col-span-2" />
              <Field label="Emergency contact name" name="emergency_contact_name" defaultValue={patient.emergency_contact_name} />
              <Field label="Emergency contact phone" name="emergency_contact_phone" type="tel" defaultValue={patient.emergency_contact_phone} />
            </div>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
