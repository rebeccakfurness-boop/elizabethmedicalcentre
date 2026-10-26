import { BookingForm } from '@/components/booking/BookingForm';
import { BookShell } from '@/components/booking/BookShell';
import { STAFF_ROLES } from '@/lib/auth';
import { getAppointmentTypes, getBookingSettings } from '@/lib/appointments';
import { addDays, clinicParts } from '@/lib/booking-shared';
import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const metadata = {
  title: 'Book an appointment – The Doctors, Kuta Lombok',
  description: 'Book a doctor at the clinic, a home or hotel visit, or a phone or video consultation in Kuta, Lombok.',
};

export default async function BookPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const [settings, types, user] = await Promise.all([getBookingSettings(), getAppointmentTypes(), getCurrentUser()]);
  const { type } = await searchParams;
  const staffPreview = !!user && STAFF_ROLES.includes(user.role) && !settings.booking_enabled;
  if (!settings.booking_enabled && !staffPreview) {
    return (
      <BookShell title="Online booking opens soon" lede={<p>We’re getting ready to open. {settings.phone ? <>Until then, call or WhatsApp us on <strong>{settings.phone}</strong>.</> : null}</p>}>
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-900">If it’s an emergency, call <strong>119</strong> now.</p>
      </BookShell>
    );
  }
  const family = user?.role === 'patient' && user.familyId
    ? (await sql<{ id: number; name: string }>`SELECT id, first_name || ' ' || last_name AS name FROM patients WHERE family_id = ${user.familyId} AND status = 'active' ORDER BY is_account_holder DESC, date_of_birth`)
    : null;
  const today = clinicParts(new Date()).date;
  const dates = Array.from({ length: Math.min(settings.booking_max_days_ahead, 60) + 1 }, (_, i) => addDays(today, i));
  const initial = types.find((t) => t.code === type || String(t.id) === type)?.id;

  return (
    <BookShell
      title="Book an appointment"
      lede={<p>See a doctor at our clinic in Kuta, have a doctor come to your hotel or villa, or talk to us by phone or video. You’ll get a confirmation by email, and can change or cancel at any time with the link in it.</p>}
    >
      {staffPreview ? <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Staff preview: online booking is switched off for the public. Turn it on in Appointments → Settings.</p> : null}
      <BookingForm
        types={types.map((t) => ({ id: t.id, name: t.name, kind: t.kind, description: t.description, duration_minutes: t.duration_minutes, price_note: t.price_note }))}
        dates={dates}
        clinicPhone={settings.phone}
        family={family}
        defaultEmail={user?.role === 'patient' ? user.email : null}
        initialTypeId={initial}
      />
    </BookShell>
  );
}
