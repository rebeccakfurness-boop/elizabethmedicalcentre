import Link from 'next/link';
import { checkInAppointment, confirmAppointment, sendRemindersNow } from '@/app/actions/appointments';
import { ApptStatusBadge, KIND_ICONS } from '@/components/booking/Badges';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { can, isClinical } from '@/lib/auth';
import { getBookingSettings, listAppointments, listPendingRequests, type Appointment } from '@/lib/appointments';
import { addDays, clinicParts, DAY_NAMES, weekdayOfDate } from '@/lib/booking-shared';
import { formatDate } from '@/lib/format';
import { requirePermission } from '@/lib/session';

const time = (d: Date) => clinicParts(d).time;

function Row({ a, clinical, actions = true }: { a: Appointment; clinical: boolean; actions?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-3 py-2.5 ${a.red_flags.length ? 'border-red-400' : 'border-line'} ${['cancelled', 'no_show'].includes(a.status) ? 'opacity-55' : ''}`}>
      <span className="w-14 font-headline text-lg font-extrabold text-pulse">{a.kind === 'walk_in' ? '~' : ''}{time(a.starts_at)}</span>
      <span className="text-xl" aria-hidden="true">{KIND_ICONS[a.kind]}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/dashboard/appointments/${a.id}`} className="font-semibold text-teal hover:underline">{a.patient_name ?? a.name}</Link>
        {!a.patient_id ? <span className="ml-2 text-xs text-amber-800">no patient card yet</span> : null}
        <span className="block truncate text-xs text-ink-soft">
          {a.type_name}{a.reason ? ` · ${a.reason}` : ''}{a.clinician_name ? ` · ${a.clinician_name}` : ''}{a.red_flags.length ? ' · ⚠ warning signs' : ''}
        </span>
      </span>
      <ApptStatusBadge status={a.status} />
      {actions && a.status === 'requested' ? (
        <ActionForm action={confirmAppointment} submitLabel="Confirm" submitClassName="btn-primary btn-sm" inline>
          <input type="hidden" name="appointment_id" value={a.id} />
        </ActionForm>
      ) : null}
      {actions && a.status === 'confirmed' && a.patient_id ? (
        <ActionForm action={checkInAppointment} submitLabel={a.kind === 'clinic' || a.kind === 'walk_in' ? 'Arrived' : 'Start visit'} submitClassName="btn-clay btn-sm" inline>
          <input type="hidden" name="appointment_id" value={a.id} />
          {clinical ? <input type="hidden" name="then" value="open" /> : null}
        </ActionForm>
      ) : null}
      {a.encounter_id && clinical ? <Link href={`/dashboard/encounters/${a.encounter_id}`} className="text-xs text-teal underline">Visit</Link> : null}
    </li>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const user = await requirePermission('viewPatients');
  const today = clinicParts(new Date()).date;
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view = sp.view === 'week' ? 'week' : 'day';
  const weekStart = addDays(date, -((weekdayOfDate(date) + 6) % 7));
  const [from, to] = view === 'week' ? [weekStart, addDays(weekStart, 6)] : [date, date];
  const [appts, pending, settings] = await Promise.all([listAppointments(from, to), listPendingRequests(), getBookingSettings()]);
  const clinical = isClinical(user.clinicalRole);
  const step = view === 'week' ? 7 : 1;
  const link = (d: string, v = view) => `/dashboard/appointments?date=${d}&view=${v}`;
  const active = appts.filter((a) => !['cancelled'].includes(a.status));

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Patients"
        title="Appointments"
        actions={
          <>
            <Link href="/dashboard/appointments/new" className="btn-clay btn-sm">+ New appointment</Link>
            {can(user.role, 'manageOperations') ? <Link href="/dashboard/appointments/settings" className="btn-ghost btn-sm">Settings</Link> : null}
          </>
        }
      />
      {!settings.booking_enabled ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online booking is <strong>off</strong>: the public can’t book yet. Staff can still add appointments and preview <Link href="/book" className="underline">/book</Link>.
        </p>
      ) : null}

      {pending.length ? (
        <section className="card mb-6 border-amber-300">
          <h2 className="card-title mb-3">Waiting for confirmation ({pending.length})</h2>
          <ul className="space-y-2">{pending.map((a) => <Row key={a.id} a={a} clinical={clinical} />)}</ul>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link(addDays(date, -step))} className="btn-ghost btn-sm">←</Link>
        <Link href={link(today)} className="btn-ghost btn-sm">Today</Link>
        <Link href={link(addDays(date, step))} className="btn-ghost btn-sm">→</Link>
        <form className="flex gap-2"><input type="hidden" name="view" value={view} /><input type="date" name="date" defaultValue={date} className="input w-auto py-1.5" aria-label="Go to date" /><button className="btn-ghost btn-sm">Go</button></form>
        <span className="font-semibold">
          {view === 'week' ? `Week of ${formatDate(weekStart)}` : `${DAY_NAMES[weekdayOfDate(date)]} ${formatDate(date)}`} · {active.length} booked
        </span>
        <span className="ml-auto inline-flex rounded-xl border border-line bg-white p-0.5 text-sm">
          <Link href={link(date, 'day')} className={`rounded-lg px-3 py-1 ${view === 'day' ? 'bg-teal text-cream' : 'text-ink-soft'}`}>Day</Link>
          <Link href={link(date, 'week')} className={`rounded-lg px-3 py-1 ${view === 'week' ? 'bg-teal text-cream' : 'text-ink-soft'}`}>Week</Link>
        </span>
      </div>

      {view === 'day' ? (
        appts.length ? <ul className="space-y-2">{appts.map((a) => <Row key={a.id} a={a} clinical={clinical} />)}</ul> : <EmptyState>No appointments on this day.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
            const list = appts.filter((a) => clinicParts(a.starts_at).date === d);
            return (
              <section key={d} className={`rounded-2xl border p-2 ${d === today ? 'border-teal bg-teal-soft/40' : 'border-line bg-white'}`}>
                <Link href={link(d, 'day')} className="mb-2 block text-sm font-semibold text-pulse hover:underline">{DAY_NAMES[weekdayOfDate(d)].slice(0, 3)} {formatDate(d).replace(/ \d{4}$/, '')}</Link>
                <ul className="space-y-1">
                  {list.map((a) => (
                    <li key={a.id} className={`rounded-lg bg-paper px-2 py-1 text-xs ${a.status === 'cancelled' ? 'line-through opacity-50' : ''}`}>
                      <Link href={`/dashboard/appointments/${a.id}`} className="hover:underline">
                        <strong>{time(a.starts_at)}</strong> {KIND_ICONS[a.kind]} {a.patient_name ?? a.name}
                      </Link>
                    </li>
                  ))}
                  {!list.length ? <li className="text-xs text-ink-soft">—</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-8 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
        <ActionForm action={sendRemindersNow} submitLabel="Send due reminders now" submitClassName="btn-ghost btn-sm" inline>
          <span>Reminders go out automatically every morning for the next day’s bookings.</span>
        </ActionForm>
      </section>
    </div>
  );
}
