import { addClosure, removeClosure, saveAppointmentType, saveBookingSettings } from '@/app/actions/appointments';
import { HoursFields } from '@/components/booking/HoursFields';
import { KindTag } from '@/components/booking/Badges';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { getAppointmentTypes, getBookingSettings } from '@/lib/appointments';
import { sql } from '@/lib/db';
import { formatDate, todayISO } from '@/lib/format';
import { requirePermission } from '@/lib/session';

export default async function BookingSettingsPage() {
  await requirePermission('manageOperations');
  const [settings, types, closures] = await Promise.all([
    getBookingSettings(),
    getAppointmentTypes(false),
    sql<{ id: number; closed_date: string; reason: string | null }>`SELECT id, closed_date, reason FROM booking_closures WHERE closed_date >= ${todayISO()} ORDER BY closed_date`,
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Appointments" title="Booking settings" back={{ href: '/dashboard/appointments', label: 'Appointments' }} />
      <section className="card mb-6">
        <ActionForm action={saveBookingSettings} submitLabel="Save booking settings">
          <label className={`flex items-start gap-3 rounded-xl p-4 ${settings.booking_enabled ? 'bg-teal-soft' : 'bg-amber-50'}`}>
            <input type="checkbox" name="booking_enabled" defaultChecked={settings.booking_enabled} className="mt-1 h-5 w-5 accent-teal" />
            <span>
              <strong>Online booking is {settings.booking_enabled ? 'on' : 'off'}</strong>
              <span className="block text-sm text-ink-soft">When on, the website shows a “Book an appointment” button and anyone can book at /book. Turn it on when the clinic is ready to see patients.</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="booking_notify_email">Email new bookings to</label><input className="input" id="booking_notify_email" name="booking_notify_email" type="email" defaultValue={settings.booking_notify_email ?? ''} placeholder={settings.email ?? 'reception@…'} /></div>
            <div><label className="label" htmlFor="booking_max_days_ahead">How far ahead people can book (days)</label><input className="input" id="booking_max_days_ahead" name="booking_max_days_ahead" type="number" min="1" max="180" defaultValue={settings.booking_max_days_ahead} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="telehealth_video_link">Video consultation link</label><input className="input" id="telehealth_video_link" name="telehealth_video_link" defaultValue={settings.telehealth_video_link ?? ''} placeholder="https://… (your Google Meet, Zoom or Doxy.me room)" /><p className="mt-1 text-xs text-ink-soft">Sent to patients who choose video. You can also set a link per appointment.</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminders_enabled" defaultChecked={settings.reminders_enabled} className="h-4 w-4 accent-teal" /> Send email reminders the day before</label>
          </div>
          <div>
            <p className="label">Opening hours for bookings (Lombok time)</p>
            <HoursFields hours={settings.hours} />
          </div>
        </ActionForm>
      </section>

      <section className="mb-6">
        <h2 className="card-title mb-3">Appointment types</h2>
        <ul className="space-y-3">
          {types.map((t) => (
            <li key={t.id} className={`card ${t.is_active ? '' : 'opacity-60'}`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span><strong className="text-pulse">{t.name}</strong> <KindTag kind={t.kind} /></span>
                  <span className="text-xs text-ink-soft">
                    {t.kind === 'walk_in' ? 'No time slots' : `${t.duration_minutes} min · ${t.capacity} at a time · ${t.auto_confirm ? 'instant' : 'needs confirming'}`}{t.is_active ? '' : ' · hidden'}
                  </span>
                </summary>
                <div className="mt-4">
                  <ActionForm action={saveAppointmentType} submitLabel="Save">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="sm:col-span-2"><label className="label" htmlFor={`n${t.id}`}>Name</label><input className="input" id={`n${t.id}`} name="name" defaultValue={t.name} /></div>
                      <div><label className="label" htmlFor={`d${t.id}`}>Length (min)</label><input className="input" id={`d${t.id}`} name="duration_minutes" type="number" min="5" defaultValue={t.duration_minutes} /></div>
                      <div><label className="label" htmlFor={`c${t.id}`}>At the same time</label><input className="input" id={`c${t.id}`} name="capacity" type="number" min="1" defaultValue={t.capacity} /></div>
                      <div className="sm:col-span-2"><label className="label" htmlFor={`ds${t.id}`}>Description</label><input className="input" id={`ds${t.id}`} name="description" defaultValue={t.description ?? ''} /></div>
                      <div><label className="label" htmlFor={`mn${t.id}`}>Minimum notice (min)</label><input className="input" id={`mn${t.id}`} name="min_notice_minutes" type="number" min="0" defaultValue={t.min_notice_minutes} /></div>
                      <div><label className="label" htmlFor={`p${t.id}`}>Price note</label><input className="input" id={`p${t.id}`} name="price_note" defaultValue={t.price_note ?? ''} placeholder="e.g. From Rp 450.000" /></div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" name="auto_confirm" defaultChecked={t.auto_confirm} className="h-4 w-4 accent-teal" /> Confirm automatically</label>
                      <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={t.is_active} className="h-4 w-4 accent-teal" /> Offer online</label>
                    </div>
                    {t.kind !== 'walk_in' ? (
                      <details>
                        <summary className="cursor-pointer text-sm text-teal">Different hours for this type{t.hours ? ' (set)' : ''}</summary>
                        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="own_hours" defaultChecked={!!t.hours} className="h-4 w-4 accent-teal" /> Use these hours instead of the clinic hours</label>
                        <HoursFields hours={t.hours ?? settings.hours} prefix={`t${t.id}_`} />
                      </details>
                    ) : null}
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="card-title mb-3">Closed days</h2>
        <p className="mb-3 text-sm text-ink-soft">Public holidays, Nyepi, staff training days. No online bookings are offered on these dates.</p>
        <ActionForm action={addClosure} submitLabel="Close this day" submitClassName="btn-ghost btn-sm" inline resetOnSuccess>
          <input type="date" name="closed_date" className="input w-auto py-1.5" required aria-label="Date" />
          <input name="reason" className="input w-56 py-1.5" placeholder="Reason (shown to patients)" aria-label="Reason" />
        </ActionForm>
        <ul className="mt-3 divide-y divide-line text-sm">
          {closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>{formatDate(c.closed_date)}{c.reason ? ` · ${c.reason}` : ''}</span>
              <ActionForm action={removeClosure} submitLabel="Reopen" submitClassName="text-xs text-ink-soft underline" inline>
                <input type="hidden" name="id" value={c.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
