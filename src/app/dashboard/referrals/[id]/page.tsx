import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cancelReferral, markReferralHandedOver, recordReferralOutcome, saveReferral, sendReferral, setReferralSharing } from '@/app/actions/referrals';
import { DictationField } from '@/components/clinical/DictationField';
import { ReferralStatusBadge } from '@/components/clinical/Referrals';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { canPrescribe } from '@/lib/auth';
import { getClinicSettings } from '@/lib/billing';
import { getNotesForPatient, NOTE_TYPE_LABELS } from '@/lib/clinical';
import { ageFrom, formatClinicTime, formatDate } from '@/lib/format';
import { getPatientLabOrders, testNames } from '@/lib/labs';
import { getPatient } from '@/lib/patients';
import { getContacts, getReferral } from '@/lib/referrals';
import { audit, requireClinical } from '@/lib/session';
import { fillOpening, REFERRAL_KIND_LABELS, REFERRAL_TEMPLATES_BY_SLUG, SPECIALTIES, URGENCY_LABELS, type ReferralUrgency } from '@/clinical/referrals';

export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClinical();
  const r = await getReferral(Number((await params).id));
  if (!r) notFound();
  const template = REFERRAL_TEMPLATES_BY_SLUG.get(r.template)!;
  await audit(user.id, 'view', 'referral', r.id);
  const [patient, contacts, notes, labOrders, settings] = await Promise.all([
    getPatient(r.patient_id),
    getContacts(),
    getNotesForPatient(r.patient_id, user),
    getPatientLabOrders(r.patient_id),
    getClinicSettings(),
  ]);
  if (!patient) notFound();
  const draft = r.status === 'draft';
  const mayEdit = draft && (r.author_id === user.id || canPrescribe(user.clinicalRole));
  const signedNotes = notes.filter((n) => n.signed_at && n.note_type !== 'admin').slice(0, 30);
  const labsWithResults = labOrders.filter((o) => o.result_count > 0 && o.status !== 'cancelled').slice(0, 20);
  const specialties = template.kind === 'other' ? [] : SPECIALTIES[template.kind];
  const pdfHref = `/api/referrals/${r.id}/pdf`;
  const name = `${patient.first_name} ${patient.last_name}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow={`Referral REF-${r.id} · ${REFERRAL_KIND_LABELS[template.kind]}`}
        title={`${template.title}: ${name}`}
        back={r.encounter_id ? { href: `/dashboard/encounters/${r.encounter_id}`, label: 'Visit' } : { href: `/dashboard/patients/${r.patient_id}`, label: name }}
        actions={
          <>
            <ReferralStatusBadge status={r.status} />
            <a href={pdfHref} target="_blank" rel="noreferrer" className="btn-primary btn-sm">📄 {draft ? 'Preview PDF' : 'Open PDF'}</a>
          </>
        }
      />

      {mayEdit ? (
        <section className="card mb-6">
          <ActionForm action={saveReferral} submitLabel="Save draft" submitClassName="btn-ghost">
            <input type="hidden" name="referral_id" value={r.id} />
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="card-title mb-2">To</legend>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="contact_id">From the referral directory</label>
                <select className="input" id="contact_id" name="contact_id" defaultValue={r.contact_id ?? ''}>
                  <option value="">Not in the directory: type below</option>
                  {(Object.keys(REFERRAL_KIND_LABELS) as (keyof typeof REFERRAL_KIND_LABELS)[]).map((k) => {
                    const list = contacts.filter((c) => c.kind === k);
                    return list.length ? (
                      <optgroup key={k} label={REFERRAL_KIND_LABELS[k]}>
                        {list.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.organisation ? `, ${c.organisation}` : ''}{c.specialty ? ` (${c.specialty})` : ''}{c.email ? '' : ' · no email'}</option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
                <p className="mt-1 text-xs text-ink-soft">
                  Choosing a contact fills any recipient boxes you leave empty. <Link href="/dashboard/referrals/contacts" className="text-teal underline">Manage the directory</Link>
                </p>
              </div>
              <div>
                <label className="label" htmlFor="recipient_name">Recipient (person, team or department)</label>
                <input className="input" id="recipient_name" name="recipient_name" defaultValue={r.recipient_name} placeholder="e.g. Dr Sari, or Emergency Department" />
              </div>
              <div>
                <label className="label" htmlFor="recipient_organisation">Hospital / practice</label>
                <input className="input" id="recipient_organisation" name="recipient_organisation" defaultValue={r.recipient_organisation ?? ''} />
              </div>
              <div>
                <label className="label" htmlFor="recipient_email">Email</label>
                <input className="input" id="recipient_email" name="recipient_email" type="email" defaultValue={r.recipient_email ?? ''} />
              </div>
              <div>
                <label className="label" htmlFor="specialty">Specialty / service</label>
                <input className="input" id="specialty" name="specialty" list="specialties" defaultValue={r.specialty ?? ''} />
                <datalist id="specialties">{specialties.map((sp) => <option key={sp} value={sp} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="urgency">Urgency</label>
                <select className="input" id="urgency" name="urgency" defaultValue={r.urgency}>
                  {(Object.keys(URGENCY_LABELS) as ReferralUrgency[]).map((u) => <option key={u} value={u}>{URGENCY_LABELS[u].label}: {URGENCY_LABELS[u].help}</option>)}
                </select>
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="card-title mb-2">Letter</legend>
              <p className="rounded-xl bg-paper p-3 text-sm">Dear …, {fillOpening(template, name, ageFrom(patient.date_of_birth))}</p>
              <p className="text-xs text-ink-soft">Filled in from the visit. Check and edit everything before signing.</p>
              <div>
                <label className="label" htmlFor="reason">{template.headings.reason} *</label>
                <input className="input" id="reason" name="reason" defaultValue={r.reason ?? ''} />
              </div>
              <DictationField name="history" label={template.headings.history} defaultValue={r.history} rows={4} enabled={settings.dictation_enabled} placeholder={template.hints?.history} />
              <DictationField name="examination" label={template.headings.examination} defaultValue={r.examination} rows={4} enabled={settings.dictation_enabled} placeholder={template.hints?.examination} />
              <div>
                <label className="label" htmlFor="investigations">Investigations</label>
                <textarea className="input" id="investigations" name="investigations" rows={3} defaultValue={r.investigations ?? ''} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="medications">Current medicines</label>
                  <textarea className="input" id="medications" name="medications" rows={3} defaultValue={r.medications ?? ''} />
                </div>
                <div>
                  <label className="label" htmlFor="allergies">Allergies</label>
                  <textarea className="input border-red-300" id="allergies" name="allergies" rows={3} defaultValue={r.allergies ?? ''} />
                </div>
              </div>
              <DictationField name="management" label={template.headings.management} defaultValue={r.management} rows={3} enabled={settings.dictation_enabled} placeholder={template.hints?.management} />
              <DictationField name="request" label="What I am asking" defaultValue={r.request} rows={2} enabled={settings.dictation_enabled} placeholder={template.hints?.request} />
            </fieldset>

            <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <legend className="card-title mb-2">Attach to the PDF</legend>
              <div>
                <p className="label">Clinical notes</p>
                {signedNotes.length ? signedNotes.map((n) => (
                  <label key={n.id} className="flex items-start gap-2 py-0.5 text-sm">
                    <input type="checkbox" name="attach_note" value={n.id} defaultChecked={r.attach_note_ids.includes(n.id)} className="mt-0.5 h-4 w-4 accent-teal" />
                    <span>{NOTE_TYPE_LABELS[n.note_type]} · {formatClinicTime(n.created_at)} · {n.author_name}<span className="block text-xs text-ink-soft">{(n.assessment ?? n.body ?? n.subjective ?? '').slice(0, 80)}</span></span>
                  </label>
                )) : <p className="text-sm text-ink-soft">No signed notes.</p>}
              </div>
              <div>
                <p className="label">Results</p>
                {labsWithResults.length ? labsWithResults.map((o) => (
                  <label key={o.id} className="flex items-start gap-2 py-0.5 text-sm">
                    <input type="checkbox" name="attach_lab" value={o.id} defaultChecked={r.attach_lab_order_ids.includes(o.id)} className="mt-0.5 h-4 w-4 accent-teal" />
                    <span>{testNames(o)}<span className="block text-xs text-ink-soft">{formatDate(o.collected_at ?? o.created_at)}{o.abnormal_count ? ` · ${o.abnormal_count} abnormal` : ''}{o.status !== 'reviewed' ? ' · not yet reviewed' : ''}</span></span>
                  </label>
                )) : <p className="text-sm text-ink-soft">No results.</p>}
              </div>
            </fieldset>

            <div className="space-y-3 rounded-xl bg-teal-soft p-4">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consent_confirmed" defaultChecked={r.consent_confirmed} className="mt-0.5 h-4 w-4 accent-teal" />
                <span>The patient (or their parent/guardian) agrees to this referral and to these notes and results being shared with the recipient.</span>
              </label>
              <button type="submit" name="intent" value="finalise" className="btn-clay">✍ Sign letter</button>
              <p className="text-xs text-ink-soft">Once signed the letter can’t be changed, and it can be emailed or printed.</p>
            </div>
          </ActionForm>
        </section>
      ) : draft ? (
        <p className="card mb-6 text-sm">This draft belongs to {r.author_name}. Preview the PDF above.</p>
      ) : (
        <section className="card mb-6 text-sm">
          <h2 className="card-title mb-2">Letter</h2>
          <p>
            To <strong>{r.recipient_name}</strong>{r.specialty ? `, ${r.specialty}` : ''}{r.recipient_organisation ? `, ${r.recipient_organisation}` : ''} · {URGENCY_LABELS[r.urgency].label}
          </p>
          <p>Reason: {r.reason}</p>
          <p className="text-ink-soft">
            Signed by {r.author_name} {formatClinicTime(r.finalised_at)} · {r.attach_note_ids.length} notes and {r.attach_lab_order_ids.length} sets of results attached
            {r.sent_at ? ` · sent ${formatClinicTime(r.sent_at)} (${r.sent_to})` : ''}
          </p>
        </section>
      )}

      {['finalised', 'sent', 'completed'].includes(r.status) ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="card-title mb-3">Send</h2>
            <ActionForm action={sendReferral} submitLabel="Email PDF" submitClassName="btn-clay btn-sm">
              <input type="hidden" name="referral_id" value={r.id} />
              <div>
                <label className="label" htmlFor="to">Recipient email</label>
                <input className="input" id="to" name="to" type="email" defaultValue={r.recipient_email ?? ''} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="copy_patient" className="h-4 w-4 accent-teal" disabled={!patient.email} />
                Email a copy to the patient{patient.email ? ` (${patient.email})` : ' (no email on file)'}
              </label>
              <p className="text-xs text-ink-soft">The email itself only shows the patient’s initials; the details are in the PDF. Replies go to {r.author_name}.</p>
            </ActionForm>
            {r.status === 'finalised' ? (
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={markReferralHandedOver} submitLabel="Mark as sent" submitClassName="btn-ghost btn-sm" inline>
                  <input type="hidden" name="referral_id" value={r.id} />
                  <select name="how" className="input w-auto py-1.5 text-sm" aria-label="How it was sent">
                    <option>Printed and given to the patient</option>
                    <option>Printed and sent with the ambulance</option>
                    <option>Sent by WhatsApp</option>
                    <option>Sent by fax</option>
                  </select>
                </ActionForm>
              </div>
            ) : null}
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <ActionForm action={setReferralSharing} submitLabel={r.shared_with_patient ? 'Remove from patient portal' : 'Show in patient portal'} submitClassName="btn-ghost btn-sm" inline>
                <input type="hidden" name="referral_id" value={r.id} />
                <input type="hidden" name="share" value={String(!r.shared_with_patient)} />
                <span>{r.shared_with_patient ? '🏠 The patient can download this letter.' : '🔒 Not visible to the patient.'}</span>
              </ActionForm>
            </div>
          </section>
          <section className="card">
            <h2 className="card-title mb-3">Outcome</h2>
            {r.outcome_notes ? <p className="mb-3 whitespace-pre-line text-sm">{r.outcome_notes}</p> : null}
            {r.reply_file_id ? <a href={`/api/files/${r.reply_file_id}`} target="_blank" rel="noreferrer" className="mb-3 block text-sm text-teal underline">📄 Reply / discharge letter</a> : null}
            <ActionForm action={recordReferralOutcome} submitLabel="Save outcome" submitClassName="btn-primary btn-sm" resetOnSuccess>
              <input type="hidden" name="referral_id" value={r.id} />
              <textarea name="outcome_notes" rows={3} className="input text-sm" placeholder="e.g. Seen 28 Oct, admitted for IV fluids, discharged day 3" aria-label="Outcome" />
              <input type="file" name="reply" accept="application/pdf,image/*" className="block text-sm" aria-label="Reply letter" />
            </ActionForm>
          </section>
        </div>
      ) : null}

      {!['completed', 'cancelled'].includes(r.status) && (r.author_id === user.id || canPrescribe(user.clinicalRole)) ? (
        <div className="mt-6">
          <ActionForm action={cancelReferral} submitLabel="Cancel this referral" submitClassName="text-xs text-ink-soft underline" inline confirm="Cancel this referral?">
            <input type="hidden" name="referral_id" value={r.id} />
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
