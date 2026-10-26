import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  addObservations,
  cancelPrescription,
  completeEncounter,
  issuePrescription,
  removePrescriptionItem,
  setPrescriptionLeaflets,
  setProtocol,
  startConsultation,
} from '@/app/actions/clinical';
import { ApprovalBanner, TriageBadge } from '@/components/clinical/Badges';
import { NoteEditor } from '@/components/clinical/NoteEditor';
import { NoteList } from '@/components/clinical/NoteList';
import { ProtocolView } from '@/components/clinical/ProtocolView';
import { RxItemForm } from '@/components/clinical/RxItemForm';
import { TriageForm } from '@/components/clinical/TriageForm';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { Field } from '@/components/ui/Field';
import { can, canPrescribe } from '@/lib/auth';
import { getClinicSettings } from '@/lib/billing';
import {
  approvalKey,
  ENCOUNTER_STATUS_LABELS,
  getApprovals,
  getEncounter,
  getEncounterPrescriptions,
  getNotesForEncounter,
  getObservations,
  getPrescriptionItems,
} from '@/lib/clinical';
import { ageFrom, formatDate } from '@/lib/format';
import { audit, requireClinical } from '@/lib/session';
import { allergyWarnings } from '@/clinical/drugs';
import { LEAFLETS } from '@/clinical/leaflets';
import { PROTOCOLS, PROTOCOLS_BY_SLUG, suggestProtocols } from '@/clinical/protocols';
import { TRIAGE_VERSION } from '@/clinical/triage';

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }) : '—';

const DISPOSITIONS = [
  'Home',
  'Home with follow-up at this clinic',
  'Home with advice to see own doctor',
  'Referred to hospital (non-urgent)',
  'Transferred to hospital (urgent)',
  'Self-discharged against advice',
];

export default async function EncounterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rx?: string }> }) {
  const user = await requireClinical();
  const enc = await getEncounter(Number((await params).id));
  if (!enc) notFound();
  const { rx: rxPreset } = await searchParams;
  await audit(user.id, 'view', 'encounter', enc.id);

  const [obs, notes, prescriptions, approvals, settings] = await Promise.all([
    getObservations(enc.id),
    getNotesForEncounter(enc.id, user),
    getEncounterPrescriptions(enc.id),
    getApprovals(),
    getClinicSettings(),
  ]);
  const items = await getPrescriptionItems(prescriptions.map((p) => p.id));
  const age = ageFrom(enc.date_of_birth);
  const closed = ['completed', 'left', 'cancelled'].includes(enc.status);
  const prescriber = canPrescribe(user.clinicalRole);
  const protocol = enc.protocol_slug ? PROTOCOLS_BY_SLUG.get(enc.protocol_slug) : undefined;
  const suggestions = suggestProtocols(enc.presenting_complaint);
  const myDraft = notes.find((n) => !n.signed_at && n.author_id === user.id);
  const latestWeight = obs.find((o) => o.weight_kg != null)?.weight_kg;
  const triageApproved = approvals.get(approvalKey('triage', 'sats', TRIAGE_VERSION));

  return (
    <div className="max-w-6xl">
      <Link href="/dashboard/clinic" className="mb-3 inline-block font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft hover:text-teal">← Clinic board</Link>

      {/* Patient banner: allergies always visible at the top */}
      <section className="mb-6 rounded-3xl bg-teal p-5 text-cream shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-cream/75">Visit · {enc.mrn}</p>
            <h1 className="font-headline text-2xl font-extrabold">
              <Link href={`/dashboard/patients/${enc.patient_id}`} className="hover:underline">{enc.first_name} {enc.last_name}</Link>
            </h1>
            <p className="text-sm text-cream/85">
              {age != null ? `${age} years` : 'Age unknown'}{latestWeight ? ` · ${latestWeight} kg` : ''} · arrived {time(enc.arrived_at)} · {ENCOUNTER_STATUS_LABELS[enc.status]}
              {enc.clinician_name ? ` · ${enc.clinician_name}` : ''}
            </p>
            <p className="mt-2 text-lg font-semibold">“{enc.presenting_complaint}”</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <TriageBadge category={enc.triage_category} large />
            {!closed && enc.status !== 'in_consultation' ? (
              <ActionForm action={startConsultation} submitLabel="Start consultation" submitClassName="btn btn-sm bg-cream text-pulse hover:bg-white" inline>
                <input type="hidden" name="encounter_id" value={enc.id} />
              </ActionForm>
            ) : null}
          </div>
        </div>
        <div className={`mt-4 rounded-2xl px-4 py-2 font-semibold ${enc.allergies ? 'bg-red-600 text-white' : 'bg-white/15'}`}>
          {enc.allergies ? `⚠ ALLERGIES: ${enc.allergies}` : 'No known allergies recorded. Check with the patient.'}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Triage */}
          <section id="triage" className="card scroll-mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="card-title">Triage &amp; observations</h2>
              {enc.triaged_at ? <span className="text-xs text-ink-soft">Triaged {time(enc.triaged_at)} by {enc.triaged_by_name}</span> : null}
            </div>
            {!enc.triaged_at && !closed ? (
              <TriageForm
                encounterId={enc.id}
                ageYears={age}
                protocolOptions={PROTOCOLS.map((p) => ({ slug: p.slug, title: p.title }))}
                suggestedProtocol={suggestions[0]?.slug ?? null}
                approved={!!triageApproved}
              />
            ) : null}
            {obs.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="table text-xs">
                  <thead><tr><th>Time</th><th>HR</th><th>RR</th><th>BP</th><th>T °C</th><th>SpO₂</th><th>AVPU</th><th>Pain</th><th>Gluc</th><th>TEWS</th></tr></thead>
                  <tbody>
                    {obs.map((o) => (
                      <tr key={o.id}>
                        <td className="whitespace-nowrap">{time(o.taken_at)}<span className="block text-ink-soft">{o.taken_by_name}</span></td>
                        <td>{o.heart_rate ?? '—'}</td>
                        <td>{o.resp_rate ?? '—'}</td>
                        <td>{o.systolic_bp ? `${o.systolic_bp}/${o.diastolic_bp ?? '?'}` : '—'}</td>
                        <td>{o.temperature ?? '—'}</td>
                        <td className={o.spo2 != null && o.spo2 < 92 ? 'font-bold text-red-700' : ''}>{o.spo2 ?? '—'}</td>
                        <td>{o.avpu ?? '—'}</td>
                        <td>{o.pain_score ?? '—'}</td>
                        <td>{o.glucose ?? '—'}</td>
                        <td className="font-bold">{o.tews ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {enc.triaged_at && !closed ? (
              <details className="mt-4">
                <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-teal">Record repeat observations</summary>
                <div className="mt-3">
                  <ActionForm action={addObservations} submitLabel="Save observations" submitClassName="btn-primary btn-sm">
                    <input type="hidden" name="encounter_id" value={enc.id} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <Field label="HR" name="heart_rate" type="number" />
                      <Field label="RR" name="resp_rate" type="number" />
                      <Field label="Sys BP" name="systolic_bp" type="number" />
                      <Field label="Dia BP" name="diastolic_bp" type="number" />
                      <Field label="Temp" name="temperature" type="number" step="0.1" />
                      <Field label="SpO₂" name="spo2" type="number" />
                      <Field label="Glucose" name="glucose" type="number" step="0.1" />
                      <Field label="Pain" name="pain_score" type="number" />
                      <div>
                        <label className="label" htmlFor="avpu-r">AVPU</label>
                        <select className="input" id="avpu-r" name="avpu" defaultValue="alert">
                          <option value="alert">Alert</option><option value="confused">Confused</option><option value="voice">Voice</option><option value="pain">Pain</option><option value="unresponsive">Unresponsive</option>
                        </select>
                      </div>
                    </div>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </section>

          {/* Notes */}
          <section className="card">
            <h2 className="card-title mb-3">Notes</h2>
            {notes.length ? (
              <div className="mb-5"><NoteList notes={notes} viewerId={user.id} clinical /></div>
            ) : null}
            {!closed || myDraft ? (
              <NoteEditor
                patientId={enc.patient_id}
                encounterId={enc.id}
                clinical
                dictationEnabled={settings.dictation_enabled}
                draft={myDraft ?? null}
              />
            ) : (
              <p className="text-sm text-ink-soft">This visit is closed. Add an addendum to an existing note if needed.</p>
            )}
          </section>

          {/* Prescription */}
          <section id="prescribe" className="card scroll-mt-6">
            <h2 className="card-title mb-3">Prescription</h2>
            {prescriptions.filter((p) => p.status !== 'draft' || items.some((i) => i.prescription_id === p.id)).map((p) => {
              const its = items.filter((i) => i.prescription_id === p.id);
              const blocks = its.flatMap((i) => allergyWarnings(i.drug_name, i.drug_code, enc.allergies).filter((w) => w.severity === 'block'));
              return (
                <div key={p.id} className="mb-4 rounded-2xl border border-line p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      {p.status === 'issued' ? <Pill tone="teal">Issued {time(p.issued_at)}</Pill> : p.status === 'cancelled' ? <Pill>Cancelled</Pill> : <Pill tone="amber">Draft</Pill>} · {p.prescriber_name}
                    </span>
                    {p.status === 'issued' ? <a href={`/print/prescription/${p.id}`} target="_blank" rel="noreferrer" className="btn-primary btn-sm">🖨 Print with info sheets</a> : null}
                  </div>
                  <ul className="divide-y divide-line text-sm">
                    {its.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span><strong>{i.drug_name}</strong> {i.dose}, {i.route}, {i.frequency}{i.duration ? `, for ${i.duration}` : ''}{i.quantity ? ` (${i.quantity})` : ''}{i.instructions ? `. ${i.instructions}` : ''}</span>
                        {p.status === 'draft' && p.prescriber_id === user.id ? (
                          <ActionForm action={removePrescriptionItem} submitLabel="Remove" submitClassName="text-xs text-ink-soft underline" inline>
                            <input type="hidden" name="item_id" value={i.id} />
                          </ActionForm>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {p.allergy_override_reason ? <p className="mt-2 text-xs text-red-800">Allergy override: {p.allergy_override_reason}</p> : null}
                  {p.status === 'draft' && p.prescriber_id === user.id ? (
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      <ActionForm action={setPrescriptionLeaflets} submitLabel="Save leaflets" submitClassName="btn-ghost btn-sm">
                        <input type="hidden" name="prescription_id" value={p.id} />
                        <p className="label">Patient information sheets to print with it</p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {LEAFLETS.map((l) => (
                            <label key={l.slug} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="leaflets" value={l.slug} defaultChecked={p.leaflet_slugs.includes(l.slug)} className="h-4 w-4 accent-teal" /> {l.title}
                            </label>
                          ))}
                        </div>
                        <textarea name="notes" defaultValue={p.notes ?? ''} rows={2} className="input text-sm" placeholder="Note to the patient or pharmacy (optional)" aria-label="Prescription note" />
                      </ActionForm>
                      <ActionForm action={issuePrescription} submitLabel="Issue prescription" submitClassName="btn-clay btn-sm">
                        <input type="hidden" name="prescription_id" value={p.id} />
                        {blocks.length ? (
                          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
                            <p className="font-semibold">⛔ {blocks.map((b) => b.message).join(' ')}</p>
                            <label className="label mt-2" htmlFor={`ovr-${p.id}`}>Reason it is safe to give anyway</label>
                            <input className="input" id={`ovr-${p.id}`} name="allergy_override_reason" />
                          </div>
                        ) : null}
                      </ActionForm>
                    </div>
                  ) : null}
                  {p.status === 'issued' && p.prescriber_id === user.id ? (
                    <div className="mt-2">
                      <ActionForm action={cancelPrescription} submitLabel="Cancel prescription" submitClassName="text-xs text-ink-soft underline" inline confirm="Cancel this issued prescription?">
                        <input type="hidden" name="prescription_id" value={p.id} />
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {prescriber && !closed ? (
              <RxItemForm key={rxPreset ?? 'none'} encounterId={enc.id} allergies={enc.allergies} ageYears={age} presetCode={rxPreset ?? null} />
            ) : !prescriber ? (
              <p className="text-sm text-ink-soft">Only doctors can prescribe. Ask the doctor to add medicines.</p>
            ) : null}
          </section>

          {/* Complete */}
          {!closed ? (
            <section className="card border-teal/40">
              <h2 className="card-title mb-3">Finish visit</h2>
              <ActionForm action={completeEncounter} submitLabel="Complete visit" submitClassName="btn-primary">
                <input type="hidden" name="encounter_id" value={enc.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Diagnosis / impression" name="diagnosis" defaultValue={enc.diagnosis ?? protocol?.title ?? ''} required />
                  <div>
                    <label className="label" htmlFor="disposition">Outcome</label>
                    <select className="input" id="disposition" name="disposition" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="patient_summary">Summary for the patient (optional, shown in their portal)</label>
                  <textarea className="input" id="patient_summary" name="patient_summary" rows={3} placeholder="Plain-language summary: what we found, what to do, when to come back" />
                </div>
              </ActionForm>
            </section>
          ) : (
            <section className="card">
              <h2 className="card-title mb-2">Outcome</h2>
              <p className="text-sm"><strong>{enc.diagnosis ?? '—'}</strong> · {enc.disposition ?? ENCOUNTER_STATUS_LABELS[enc.status]} · {time(enc.completed_at)}</p>
              {can(user.role, 'finance') ? (
                enc.invoice_id ? (
                  <Link href={`/dashboard/invoices/${enc.invoice_id}`} className="btn-ghost btn-sm mt-3">Open invoice</Link>
                ) : (
                  <Link href={`/dashboard/invoices/new?family=${enc.family_id}&patient=${enc.patient_id}&encounter=${enc.id}`} className="btn-clay btn-sm mt-3">Create invoice for this visit</Link>
                )
              ) : null}
            </section>
          )}
        </div>

        {/* Protocol column */}
        <aside className="lg:col-span-2">
          <section className="card lg:sticky lg:top-6">
            <h2 className="card-title mb-3">Protocol</h2>
            <ActionForm action={setProtocol} submitLabel="Use" submitClassName="btn-ghost btn-sm" inline>
              <input type="hidden" name="encounter_id" value={enc.id} />
              <select name="protocol_slug" defaultValue={enc.protocol_slug ?? suggestions[0]?.slug ?? ''} className="input flex-1 py-1.5 text-sm" aria-label="Protocol">
                <option value="">None</option>
                {suggestions.length ? (
                  <optgroup label="Suggested for this complaint">
                    {suggestions.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
                  </optgroup>
                ) : null}
                <optgroup label="All protocols">
                  {PROTOCOLS.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
                </optgroup>
              </select>
            </ActionForm>
            {protocol ? (
              <div className="mt-4 max-h-[75vh] space-y-3 overflow-y-auto pr-1">
                <h3 className="font-headline text-lg font-extrabold text-pulse">{protocol.title}</h3>
                <ApprovalBanner approved={approvals.get(approvalKey('protocol', protocol.slug, protocol.version))} />
                <ProtocolView protocol={protocol} rxHref={prescriber && !closed ? (code) => `/dashboard/encounters/${enc.id}?rx=${code}#prescribe` : undefined} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                {suggestions.length ? 'Choose a protocol above to see the steps.' : 'No protocol matched the complaint. Pick one from the list, or use clinical judgement.'}
              </p>
            )}
            <p className="mt-4 text-xs text-ink-soft">Visit started {formatDate(enc.arrived_at)}. <Link href="/dashboard/protocols" className="underline">All protocols</Link></p>
          </section>
        </aside>
      </div>
    </div>
  );
}
