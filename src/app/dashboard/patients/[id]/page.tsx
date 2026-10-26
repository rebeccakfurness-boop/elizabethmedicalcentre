import Link from 'next/link';
import { notFound } from 'next/navigation';
import { checkInPatient } from '@/app/actions/clinical';
import { moveToFamily, setPatientStatus, updateMedical } from '@/app/actions/patients';
import { TriageBadge } from '@/components/clinical/Badges';
import { NoteEditor } from '@/components/clinical/NoteEditor';
import { NoteList } from '@/components/clinical/NoteList';
import { PatientCardHeader } from '@/components/patients/PatientCardHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { ClaimStatusBadge, InvoiceStatusBadge, Pill } from '@/components/ui/Badges';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { can, isClinical } from '@/lib/auth';
import { getClinicSettings, listClaims, listInvoices } from '@/lib/billing';
import { ENCOUNTER_STATUS_LABELS, getNotesForPatient, getPatientEncounters, getPatientPrescriptions, getPrescriptionItems } from '@/lib/clinical';
import { query } from '@/lib/db';
import { ageFrom, formatClinicTime, formatDate, formatIDR } from '@/lib/format';
import { getFamily, getFamilyMembers, getPatient } from '@/lib/patients';
import { audit, requirePermission } from '@/lib/session';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-2 text-sm last:border-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium">{value || <span className="text-ink-soft">—</span>}</dd>
    </div>
  );
}

export default async function PatientCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('viewPatients');
  const patient = await getPatient(Number((await params).id));
  if (!patient) notFound();
  await audit(user.id, 'view', 'patient', patient.id);

  const [family, members] = await Promise.all([getFamily(patient.family_id), getFamilyMembers(patient.family_id)]);
  const finance = can(user.role, 'finance');
  const manage = can(user.role, 'managePatients');
  const invoiceIds = finance
    ? (await query<{ invoice_id: number }>(`SELECT DISTINCT invoice_id FROM invoice_items WHERE patient_id = $1`, [patient.id])).map((r) => r.invoice_id)
    : [];
  const invoices = finance ? (await listInvoices({ familyId: patient.family_id })).filter((i) => invoiceIds.includes(i.id)) : [];
  const claims = finance ? (await listClaims({ familyId: patient.family_id })).filter((c) => c.patient_id === patient.id) : [];
  const clinical = isClinical(user.clinicalRole);
  const [encounters, notes, prescriptions, settings] = await Promise.all([
    getPatientEncounters(patient.id),
    getNotesForPatient(patient.id, user),
    clinical ? getPatientPrescriptions(patient.id) : Promise.resolve([]),
    getClinicSettings(),
  ]);
  const rxItems = await getPrescriptionItems(prescriptions.map((r) => r.id));
  const openVisit = encounters.find((e) => ['waiting', 'triaged', 'in_consultation'].includes(e.status));
  const insuranceExpired = patient.insurance_expiry && patient.insurance_expiry < new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl">
      <Link href="/dashboard/patients" className="mb-3 inline-block font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">
        ← Patients
      </Link>

      <PatientCardHeader
        patient={patient}
        familyName={family?.account_name ?? ''}
        familyHref={`/dashboard/families/${patient.family_id}`}
        balance={finance ? family?.balance ?? 0 : null}
        actions={
          <>
            {openVisit && clinical ? (
              <Link href={`/dashboard/encounters/${openVisit.id}`} className="btn btn-sm bg-clay text-cream hover:bg-pulse">Open current visit</Link>
            ) : null}
            {manage ? <Link href={`/dashboard/patients/${patient.id}/edit`} className="btn btn-sm bg-cream text-pulse hover:bg-white">Edit details</Link> : null}
            {finance ? (
              <Link href={`/dashboard/invoices/new?family=${patient.family_id}&patient=${patient.id}`} className="btn btn-sm bg-clay text-cream hover:bg-pulse">
                + New invoice
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-labelledby="medical">
          <h2 id="medical" className="card-title mb-3">Medical</h2>
          {patient.allergies ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-label text-xs font-bold uppercase tracking-wider text-red-800">Allergies</p>
              <p className="mt-1 whitespace-pre-line text-red-900">{patient.allergies}</p>
            </div>
          ) : (
            <p className="mb-4 rounded-xl bg-paper p-3 text-sm text-ink-soft">No known allergies recorded.</p>
          )}
          <dl>
            <Row label="Blood type" value={patient.blood_type} />
            {clinical ? (
              <>
                <Row label="Current medications" value={patient.current_medications ? <span className="whitespace-pre-line">{patient.current_medications}</span> : null} />
                <Row label="Medical notes" value={patient.medical_notes ? <span className="whitespace-pre-line">{patient.medical_notes}</span> : null} />
              </>
            ) : null}
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-teal">Update medical information</summary>
            <div className="mt-4">
              <ActionForm action={updateMedical} submitLabel="Save medical information">
                <input type="hidden" name="id" value={patient.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Blood type" name="blood_type" defaultValue={patient.blood_type} placeholder="Unknown" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }))} />
                  <TextArea label="Allergies" name="allergies" defaultValue={patient.allergies} />
                  {clinical ? (
                    <>
                      <TextArea label="Current medications" name="current_medications" defaultValue={patient.current_medications} />
                      <TextArea label="Medical notes" name="medical_notes" defaultValue={patient.medical_notes} />
                    </>
                  ) : null}
                </div>
              </ActionForm>
            </div>
          </details>
        </section>

        <section className="card" aria-labelledby="family">
          <h2 id="family" className="card-title mb-3">Family</h2>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${m.id === patient.id ? 'bg-teal-soft' : 'hover:bg-paper'}`}>
                <Link href={`/dashboard/patients/${m.id}`} className="text-sm font-semibold text-teal hover:underline">
                  {m.first_name} {m.last_name}
                  <span className="ml-2 font-normal text-ink-soft">{ageFrom(m.date_of_birth) != null ? `${ageFrom(m.date_of_birth)}y` : ''}</span>
                </Link>
                {m.is_account_holder ? <Pill tone="clay">Account holder</Pill> : m.relationship ? <span className="text-xs text-ink-soft">{m.relationship}</span> : null}
              </li>
            ))}
          </ul>
          <Link href={`/dashboard/families/${patient.family_id}`} className="btn-ghost btn-sm mt-4 w-full">Open family account</Link>
        </section>

        <section className="card" aria-labelledby="contact">
          <h2 id="contact" className="card-title mb-3">Contact</h2>
          <dl>
            <Row label="Phone" value={patient.phone ? <a href={`tel:${patient.phone}`} className="text-teal">{patient.phone}</a> : null} />
            <Row label="Email" value={patient.email ? <a href={`mailto:${patient.email}`} className="text-teal">{patient.email}</a> : null} />
            <Row label="Address" value={patient.address} />
            <Row label="Emergency contact" value={patient.emergency_contact_name ? `${patient.emergency_contact_name} ${patient.emergency_contact_phone ?? ''}` : null} />
            <Row label="Nationality" value={patient.nationality} />
            <Row label="ID / passport" value={patient.id_number} />
          </dl>
        </section>

        <section className="card" aria-labelledby="insurance">
          <h2 id="insurance" className="card-title mb-3">Insurance</h2>
          {patient.insurer_name ? (
            <dl>
              <Row label="Insurer" value={patient.insurer_name} />
              <Row label="Policy no." value={patient.insurance_policy_number} />
              <Row label="Name on policy" value={patient.insurance_member_name} />
              <Row label="Expiry" value={patient.insurance_expiry ? <span className={insuranceExpired ? 'text-red-700' : ''}>{formatDate(patient.insurance_expiry)}{insuranceExpired ? ' (expired)' : ''}</span> : null} />
            </dl>
          ) : (
            <p className="text-sm text-ink-soft">Self-pay. Add an insurer from <strong>Edit details</strong>.</p>
          )}
        </section>

        {finance ? (
          <section className="card" aria-labelledby="billing">
            <h2 id="billing" className="card-title mb-3">Billing for this patient</h2>
            {invoices.length === 0 ? (
              <p className="text-sm text-ink-soft">No invoices include this patient yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoices.slice(0, 8).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="text-teal hover:underline">{inv.invoice_number}</Link>
                    <span className="text-ink-soft">{formatIDR(inv.total)}</span>
                    <InvoiceStatusBadge status={inv.status} daysOverdue={inv.days_overdue} />
                  </li>
                ))}
              </ul>
            )}
            {claims.length ? (
              <>
                <h3 className="card-title mb-2 mt-5">Insurance claims</h3>
                <ul className="space-y-2 text-sm">
                  {claims.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <Link href={`/dashboard/insurance/${c.id}`} className="text-teal hover:underline">{c.insurer_name}</Link>
                      <span className="text-ink-soft">{formatIDR(c.amount_claimed)}</span>
                      <ClaimStatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <section className="card mt-6" aria-labelledby="record">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="record" className="card-title">Clinical record</h2>
          {!clinical ? <p className="text-xs text-ink-soft">🔒 Notes marked clinical-only are hidden from your account.</p> : null}
        </div>

        {openVisit ? (
          <p className="mb-4 rounded-xl bg-teal-soft p-3 text-sm">
            In the clinic now: <strong>{openVisit.presenting_complaint}</strong> · {ENCOUNTER_STATUS_LABELS[openVisit.status]}
            {openVisit.triage_category ? <span className="ml-2"><TriageBadge category={openVisit.triage_category} /></span> : null}
          </p>
        ) : (
          <div className="mb-5 rounded-xl bg-paper p-3">
            <ActionForm action={checkInPatient} submitLabel={clinical ? 'Start visit' : 'Check in to clinic'} submitClassName="btn-clay btn-sm" inline>
              <input type="hidden" name="patient_id" value={patient.id} />
              {clinical ? <input type="hidden" name="then" value="open" /> : null}
              <input className="input w-72 py-1.5" name="presenting_complaint" placeholder="Reason for visit" required aria-label="Reason for visit" />
              <select className="input w-auto py-1.5" name="encounter_type" aria-label="Visit type">
                <option value="walk_in">Walk-in</option>
                <option value="appointment">Appointment</option>
                <option value="follow_up">Follow-up</option>
                <option value="home_visit">Home / hotel visit</option>
                <option value="telemedicine">Phone / video</option>
              </select>
            </ActionForm>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h3 className="mb-2 font-label text-xs font-bold uppercase tracking-wider text-ink-soft">Notes</h3>
            {notes.length ? <NoteList notes={notes} viewerId={user.id} clinical={clinical} linkEncounters /> : <p className="text-sm text-ink-soft">No notes you can see yet.</p>}
            <details className="mt-4">
              <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-teal">
                {clinical ? '+ Add a note outside a visit (phone call, results, etc.)' : '+ Add an admin note'}
              </summary>
              <div className="mt-3">
                <NoteEditor patientId={patient.id} clinical={clinical} dictationEnabled={settings.dictation_enabled} defaultType="phone" />
              </div>
            </details>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-label text-xs font-bold uppercase tracking-wider text-ink-soft">Visits</h3>
              {encounters.length === 0 ? (
                <p className="text-sm text-ink-soft">No visits yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {encounters.slice(0, 15).map((e) => (
                    <li key={e.id} className="rounded-xl border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        {clinical ? (
                          <Link href={`/dashboard/encounters/${e.id}`} className="font-semibold text-teal hover:underline">{formatClinicTime(e.arrived_at)}</Link>
                        ) : <span className="font-semibold">{formatClinicTime(e.arrived_at)}</span>}
                        {e.triage_category ? <TriageBadge category={e.triage_category} /> : null}
                      </div>
                      <p className="text-ink-soft">{e.presenting_complaint}</p>
                      <p className="text-xs text-ink-soft">
                        {ENCOUNTER_STATUS_LABELS[e.status]}
                        {clinical && e.diagnosis ? ` · ${e.diagnosis}` : ''}
                        {e.clinician_name ? ` · ${e.clinician_name}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {clinical ? (
              <div>
                <h3 className="mb-2 font-label text-xs font-bold uppercase tracking-wider text-ink-soft">Prescriptions</h3>
                {prescriptions.length === 0 ? (
                  <p className="text-sm text-ink-soft">None issued.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {prescriptions.map((r) => (
                      <li key={r.id} className={`rounded-xl border border-line px-3 py-2 ${r.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{formatDate(r.issued_at ?? r.created_at)}</span>
                          {r.status === 'cancelled' ? <Pill tone="red">Cancelled</Pill> : <Link href={`/print/prescription/${r.id}`} target="_blank" className="text-xs text-teal underline">Print with sheets</Link>}
                        </div>
                        <ul className="mt-1 text-ink-soft">
                          {rxItems.filter((i) => i.prescription_id === r.id).map((i) => <li key={i.id}>{i.drug_name} {i.dose} {i.frequency}{i.duration ? ` · ${i.duration}` : ''}</li>)}
                        </ul>
                        <p className="text-xs text-ink-soft">{r.prescriber_name}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {manage ? (
        <details className="card mt-6">
          <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-ink-soft">Record admin</summary>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <ActionForm action={setPatientStatus} submitLabel={patient.status === 'active' ? 'Mark inactive' : 'Reactivate'} submitClassName="btn-ghost">
              <input type="hidden" name="id" value={patient.id} />
              <input type="hidden" name="status" value={patient.status === 'active' ? 'inactive' : 'active'} />
              <p className="text-sm text-ink-soft">Inactive patients are hidden from the default patient list. Their records and invoices are kept.</p>
            </ActionForm>
            <ActionForm action={moveToFamily} submitLabel="Move to family" submitClassName="btn-ghost">
              <input type="hidden" name="id" value={patient.id} />
              <Field label="Move to family account no." name="family_id" type="number" hint={`Currently family #${patient.family_id}. Existing invoices stay on the old account.`} />
            </ActionForm>
          </div>
        </details>
      ) : null}
    </div>
  );
}
