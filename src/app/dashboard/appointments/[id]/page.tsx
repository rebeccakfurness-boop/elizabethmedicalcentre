import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  checkInAppointment,
  confirmAppointment,
  createPatientFromAppointment,
  linkAppointmentPatient,
  markNoShow,
  resendAppointmentEmail,
  staffCancel,
  staffReschedule,
  staffSlots,
  updateAppointmentDetails,
} from '@/app/actions/appointments';
import { ApptStatusBadge, KindTag } from '@/components/booking/Badges';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { can, isClinical } from '@/lib/auth';
import { getAppointment, getAppointmentEvents, getBookingSettings } from '@/lib/appointments';
import { addDays, clinicParts, formatClinicDateTime } from '@/lib/booking-shared';
import { sql } from '@/lib/db';
import { formatClinicTime, formatDate } from '@/lib/format';
import { searchPatients } from '@/lib/patients';
import { audit, requirePermission } from '@/lib/session';

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission('viewPatients');
  const a = await getAppointment(Number((await params).id));
  if (!a) notFound();
  await audit(user.id, 'view', 'appointment', a.id);
  const { q } = await searchParams;
  const [events, settings, clinicians] = await Promise.all([
    getAppointmentEvents(a.id),
    getBookingSettings(),
    sql<{ id: number; name: string }>`SELECT id, name FROM users WHERE clinical_role IS NOT NULL AND is_active ORDER BY name`,
  ]);
  // Suggest existing cards that match the booking's phone, email or name.
  const digits = (a.phone ?? '').replace(/\D/g, '').slice(-8);
  const matches = a.patient_id
    ? []
    : await sql<{ id: number; first_name: string; last_name: string; mrn: string; date_of_birth: string | null; phone: string | null; email: string | null }>`
        SELECT id, first_name, last_name, mrn, date_of_birth, phone, email FROM patients
        WHERE (${a.email}::text IS NOT NULL AND lower(email) = lower(${a.email}))
           OR (${digits} <> '' AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE '%' || ${digits})
           OR lower(first_name || ' ' || last_name) = lower(${a.name})
        LIMIT 10`;
  const searched = !a.patient_id && q ? (await searchPatients(q)).slice(0, 10) : [];
  const open = ['requested', 'confirmed'].includes(a.status);
  const today = clinicParts(new Date()).date;
  const dates = Array.from({ length: 61 }, (_, i) => addDays(today, i));
  const clinical = isClinical(user.clinicalRole);

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow={`Appointment · booked ${formatClinicTime(a.created_at)} via ${a.source === 'web' ? 'website' : a.source}`}
        title={a.patient_name ?? a.name}
        back={{ href: `/dashboard/appointments?date=${clinicParts(a.starts_at).date}`, label: 'Diary' }}
        actions={<ApptStatusBadge status={a.status} />}
      />
      {a.red_flags.length ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white">⚠ Warning signs ticked when booking: {a.red_flags.join(', ')}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="card">
            <p className="font-headline text-2xl font-extrabold text-pulse">{a.kind === 'walk_in' ? `Expected around ${clinicParts(a.starts_at).time}` : formatClinicDateTime(a.starts_at)}</p>
            <p className="mb-3 mt-1"><KindTag kind={a.kind} /> · {a.type_name} · {a.duration_minutes} min</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-soft">Reason</dt><dd>{a.reason ?? '—'}</dd></div>
              <div><dt className="text-ink-soft">Phone</dt><dd>{a.phone ? <a className="text-teal" href={`https://wa.me/${a.phone.replace(/\D/g, '')}`}>{a.phone}</a> : '—'}</dd></div>
              <div><dt className="text-ink-soft">Email</dt><dd>{a.email ?? '—'}</dd></div>
              <div><dt className="text-ink-soft">Date of birth</dt><dd>{a.date_of_birth ? formatDate(a.date_of_birth) : '—'}</dd></div>
              {a.kind === 'home_visit' ? <div className="sm:col-span-2"><dt className="text-ink-soft">Visit address</dt><dd>{a.address}</dd></div> : null}
              {a.kind === 'telehealth' ? <div><dt className="text-ink-soft">How</dt><dd>{a.telehealth_mode === 'video' ? `Video${a.video_link ?? settings.telehealth_video_link ? `: ${a.video_link ?? settings.telehealth_video_link}` : ' (add a link below)'}` : 'Phone call'}</dd></div> : null}
              {a.cancel_reason ? <div><dt className="text-ink-soft">Cancelled because</dt><dd>{a.cancel_reason}</dd></div> : null}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {a.status === 'requested' ? (
                <ActionForm action={confirmAppointment} submitLabel="Confirm and email the patient" submitClassName="btn-primary btn-sm" inline>
                  <input type="hidden" name="appointment_id" value={a.id} />
                </ActionForm>
              ) : null}
              {open && a.patient_id ? (
                <ActionForm action={checkInAppointment} submitLabel={a.kind === 'clinic' || a.kind === 'walk_in' ? 'Patient has arrived: check in' : 'Start the visit'} submitClassName="btn-clay btn-sm" inline>
                  <input type="hidden" name="appointment_id" value={a.id} />
                  {clinical ? <input type="hidden" name="then" value="open" /> : null}
                </ActionForm>
              ) : null}
              {open ? (
                <ActionForm action={markNoShow} submitLabel="Did not attend" submitClassName="btn-ghost btn-sm" inline confirm="Mark as did not attend?">
                  <input type="hidden" name="appointment_id" value={a.id} />
                </ActionForm>
              ) : null}
              {a.encounter_id && clinical ? <Link href={`/dashboard/encounters/${a.encounter_id}`} className="btn-ghost btn-sm">Open visit</Link> : null}
            </div>
          </section>

          <section className="card">
            <h2 className="card-title mb-3">Patient card</h2>
            {a.patient_id ? (
              <p className="text-sm">Linked to <Link href={`/dashboard/patients/${a.patient_id}`} className="font-semibold text-teal underline">{a.patient_name} ({a.mrn})</Link>.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink-soft">This booking isn’t linked to a patient card yet. Link it (or create one) before checking in.</p>
                {[...matches, ...searched.filter((s) => !matches.some((m) => m.id === s.id))].length ? (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {[...matches, ...searched.filter((s) => !matches.some((m) => m.id === s.id))].map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span><strong>{p.first_name} {p.last_name}</strong> <span className="text-ink-soft">{p.mrn}{p.date_of_birth ? ` · ${formatDate(p.date_of_birth)}` : ''}{p.phone ? ` · ${p.phone}` : ''}</span></span>
                        <ActionForm action={linkAppointmentPatient} submitLabel="Link" submitClassName="btn-primary btn-sm" inline>
                          <input type="hidden" name="appointment_id" value={a.id} />
                          <input type="hidden" name="patient_id" value={p.id} />
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form className="flex gap-2">
                  <input name="q" defaultValue={q} className="input py-1.5 text-sm" placeholder="Search patients" aria-label="Search patients" />
                  <button className="btn-ghost btn-sm">Search</button>
                </form>
                {can(user.role, 'managePatients') ? (
                  <ActionForm action={createPatientFromAppointment} submitLabel="Create a new patient card from this booking" submitClassName="btn-ghost btn-sm" inline>
                    <input type="hidden" name="appointment_id" value={a.id} />
                  </ActionForm>
                ) : null}
              </div>
            )}
          </section>

          {open && a.kind !== 'walk_in' ? (
            <section className="card">
              <h2 className="card-title mb-3">Move</h2>
              <ActionForm action={staffReschedule} submitLabel="Move appointment" submitClassName="btn-primary btn-sm">
                <input type="hidden" name="appointment_id" value={a.id} />
                <SlotPicker typeId={a.type_id} dates={dates} fetchSlots={staffSlots} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-teal">Or type any time (overrides free slots)</summary>
                  <div className="mt-2"><input type="time" name="custom_time" className="input w-auto py-1.5" aria-label="Time" /></div>
                  <p className="mt-1 text-xs text-ink-soft">Uses the day selected above.</p>
                </details>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-teal" /> Email the patient the new time</label>
              </ActionForm>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="card-title mb-3">Details</h2>
            <ActionForm action={updateAppointmentDetails} submitLabel="Save">
              <input type="hidden" name="appointment_id" value={a.id} />
              <div>
                <label className="label" htmlFor="clinician_id">Clinician</label>
                <select className="input" id="clinician_id" name="clinician_id" defaultValue={a.clinician_id ?? ''}>
                  <option value="">Not assigned</option>
                  {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {a.kind === 'telehealth' ? <div><label className="label" htmlFor="video_link">Video link for this call</label><input className="input" id="video_link" name="video_link" defaultValue={a.video_link ?? ''} placeholder={settings.telehealth_video_link ?? 'https://…'} /></div> : <input type="hidden" name="video_link" value={a.video_link ?? ''} />}
              <div><label className="label" htmlFor="reason">Reason</label><input className="input" id="reason" name="reason" defaultValue={a.reason ?? ''} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="phone">Phone</label><input className="input" id="phone" name="phone" defaultValue={a.phone ?? ''} /></div>
                <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" defaultValue={a.email ?? ''} /></div>
              </div>
              {a.kind === 'home_visit' ? <div><label className="label" htmlFor="address">Address</label><textarea className="input" id="address" name="address" rows={2} defaultValue={a.address ?? ''} /></div> : <input type="hidden" name="address" value={a.address ?? ''} />}
              <div><label className="label" htmlFor="staff_notes">Staff notes (not shown to the patient)</label><textarea className="input" id="staff_notes" name="staff_notes" rows={2} defaultValue={a.staff_notes ?? ''} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminders_wanted" defaultChecked={a.reminders_wanted} className="h-4 w-4 accent-teal" /> Email reminder the day before</label>
            </ActionForm>
          </section>

          {a.email ? (
            <section className="card">
              <h2 className="card-title mb-3">Email the patient</h2>
              <ActionForm action={resendAppointmentEmail} submitLabel="Send" submitClassName="btn-ghost btn-sm" inline>
                <input type="hidden" name="appointment_id" value={a.id} />
                <select name="kind" className="input w-auto py-1.5 text-sm" aria-label="Which email">
                  <option value="confirmed">Confirmation</option>
                  <option value="reminder">Reminder</option>
                </select>
              </ActionForm>
              {a.reminder_sent_at ? <p className="mt-2 text-xs text-ink-soft">Reminder sent {formatClinicTime(a.reminder_sent_at)}</p> : null}
            </section>
          ) : null}

          {open ? (
            <section className="card">
              <h2 className="card-title mb-3">Cancel</h2>
              <ActionForm action={staffCancel} submitLabel="Cancel appointment" submitClassName="btn-ghost btn-sm" confirm="Cancel this appointment?">
                <input type="hidden" name="appointment_id" value={a.id} />
                <input name="reason" className="input text-sm" placeholder="Reason" aria-label="Reason" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-teal" /> Email the patient</label>
              </ActionForm>
            </section>
          ) : null}

          <section className="card">
            <h2 className="card-title mb-3">History</h2>
            <ul className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className={e.kind === 'email_failed' ? 'text-red-700' : 'text-ink-soft'}>
                  {formatClinicTime(e.created_at)} · <strong>{e.kind.replace(/_/g, ' ')}</strong>{e.detail ? `: ${e.detail}` : ''}{e.user_name ? ` (${e.user_name})` : ''}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
