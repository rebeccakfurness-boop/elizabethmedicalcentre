import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cancelByToken, rescheduleByToken } from '@/app/actions/booking';
import { BookShell } from '@/components/booking/BookShell';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { ActionForm } from '@/components/ui/ActionForm';
import { getAppointmentByToken, getBookingSettings } from '@/lib/appointments';
import { addDays, clinicParts, formatClinicDateTime, STATUS_LABELS } from '@/lib/booking-shared';

export const metadata = { title: 'Your appointment – The Doctors', robots: { index: false } };

export default async function ManageBookingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string; moved?: string; cancelled?: string }> }) {
  const { token } = await params;
  const flags = await searchParams;
  const appt = await getAppointmentByToken(token);
  if (!appt) notFound();
  const settings = await getBookingSettings();
  const upcoming = appt.ends_at > new Date();
  const changeable = upcoming && ['requested', 'confirmed'].includes(appt.status);
  const today = clinicParts(new Date()).date;
  const dates = Array.from({ length: Math.min(settings.booking_max_days_ahead, 60) + 1 }, (_, i) => addDays(today, i));
  const where =
    appt.kind === 'clinic' ? `At the clinic: ${settings.address}`
    : appt.kind === 'home_visit' ? `Home visit: ${appt.address ?? ''}`
    : appt.kind === 'telehealth' ? (appt.telehealth_mode === 'video' ? 'Video call (link by email)' : `Phone call to ${appt.phone ?? 'you'}`)
    : `At the clinic: ${settings.address}`;

  return (
    <BookShell title={appt.kind === 'walk_in' ? 'We’re expecting you' : 'Your appointment'}>
      {flags.new ? (
        <div role="status" className="mb-6 rounded-2xl bg-teal p-5 text-cream">
          <p className="text-lg font-semibold">
            {appt.kind === 'walk_in' ? 'Thank you. The clinic knows you’re on your way.' : appt.status === 'requested' ? 'Request received. We’ll confirm the time with you shortly.' : 'You’re booked in.'}
          </p>
          <p className="mt-1 text-sm text-cream/90">{appt.email ? `We’ve emailed the details to ${appt.email}.` : 'Keep this page: you can use it to change or cancel.'}</p>
        </div>
      ) : null}
      {flags.moved ? <p role="status" className="mb-6 rounded-xl bg-teal-soft px-4 py-3 text-sm text-teal-deep">Your appointment has been moved. We’ve emailed the new time.</p> : null}
      {flags.cancelled ? <p role="status" className="mb-6 rounded-xl bg-paper px-4 py-3 text-sm">Your appointment is cancelled.</p> : null}
      {appt.red_flags.length ? (
        <p role="alert" className="mb-6 rounded-xl bg-red-600 p-4 font-semibold text-white">If you have {appt.red_flags[0].toLowerCase()} or are getting worse, call 119 now.</p>
      ) : null}

      <section className="card mb-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="label">What</dt><dd className="font-semibold">{appt.type_name}</dd></div>
          <div><dt className="label">Status</dt><dd className="font-semibold">{STATUS_LABELS[appt.status]}</dd></div>
          <div><dt className="label">{appt.kind === 'walk_in' ? 'Expected around' : 'When (Lombok time)'}</dt><dd className="font-semibold">{formatClinicDateTime(appt.starts_at)}</dd></div>
          <div><dt className="label">Where</dt><dd>{where}</dd></div>
          <div><dt className="label">For</dt><dd>{appt.name}</dd></div>
          <div><dt className="label">Reason</dt><dd>{appt.reason}</dd></div>
        </dl>
        {settings.phone ? <p className="mt-4 text-sm text-ink-soft">Questions? Call or WhatsApp {settings.phone}.</p> : null}
      </section>

      {changeable && appt.kind !== 'walk_in' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="card-title mb-3">Change the time</h2>
            <ActionForm action={rescheduleByToken} submitLabel="Move my appointment" submitClassName="btn-primary">
              <input type="hidden" name="token" value={token} />
              <SlotPicker typeId={appt.type_id} dates={dates} token={token} />
            </ActionForm>
          </section>
          <section className="card h-fit">
            <h2 className="card-title mb-3">Cancel</h2>
            <ActionForm action={cancelByToken} submitLabel="Cancel appointment" submitClassName="btn-ghost" confirm="Cancel this appointment?">
              <input type="hidden" name="token" value={token} />
              <input name="reason" className="input text-sm" placeholder="Reason (optional)" aria-label="Reason for cancelling" />
            </ActionForm>
          </section>
        </div>
      ) : changeable ? (
        <ActionForm action={cancelByToken} submitLabel="I’m not coming any more" submitClassName="btn-ghost" confirm="Let the clinic know you’re not coming?">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      ) : null}
      <p className="mt-8 text-sm"><Link href="/book" className="text-teal underline">Book another appointment</Link></p>
    </BookShell>
  );
}
