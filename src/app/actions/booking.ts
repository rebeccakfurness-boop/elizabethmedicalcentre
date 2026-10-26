'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { STAFF_ROLES } from '@/lib/auth';
import {
  cancelAppointment,
  createAppointment,
  getAppointmentByToken,
  getAppointmentType,
  getBookingSettings,
  getSlots,
  rescheduleAppointment,
} from '@/lib/appointments';
import { RED_FLAGS } from '@/lib/booking-shared';
import { sql } from '@/lib/db';
import { isEmail, notifyClinicOfBooking, sendAppointmentEmail } from '@/lib/email';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { getCurrentUser } from '@/lib/session';

async function bookingOpen(): Promise<boolean> {
  const settings = await getBookingSettings();
  if (settings.booking_enabled) return true;
  // Staff can try the booking pages before they go live.
  const user = await getCurrentUser();
  return !!user && STAFF_ROLES.includes(user.role);
}

/** Free times for the date picker. Public, read-only. */
export async function getAvailableSlots(typeId: number, date: string, token?: string): Promise<{ slots: string[]; note?: string }> {
  if (!(await bookingOpen())) return { slots: [], note: 'Online booking isn’t open yet.' };
  const excludeId = token ? (await getAppointmentByToken(token))?.id : undefined;
  return getSlots(Number(typeId), String(date), { excludeId });
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
}

export async function submitBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await bookingOpen())) return { error: 'Online booking isn’t open yet. Please call or WhatsApp us.' };
  // Bots fill in every field, including this hidden one.
  if (str(fd, 'website')) return { error: 'Something went wrong. Please call us to book.' };
  const ip = await clientIp();
  if (ip) {
    const [{ n }] = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM appointments WHERE client_ip = ${ip} AND created_at > now() - interval '1 hour'`;
    if (n >= 6) return { error: 'Too many bookings from this connection. Please call us to book.' };
  }
  const type = await getAppointmentType(num(fd, 'type_id') ?? 0);
  if (!type || !type.is_active) return { error: 'Choose what kind of appointment you need.' };

  const user = await getCurrentUser();
  const portal = user?.role === 'patient' ? user : null;
  let patientId: number | null = null;
  let name = str(fd, 'name');
  let dob = dateStr(fd, 'date_of_birth');
  if (portal) {
    const pid = num(fd, 'patient_id');
    const [p] = pid
      ? await sql<{ id: number; first_name: string; last_name: string; date_of_birth: string | null }>`
          SELECT id, first_name, last_name, date_of_birth FROM patients WHERE id = ${pid} AND family_id = ${portal.familyId}`
      : [];
    if (!p) return { error: 'Choose who the appointment is for.' };
    patientId = p.id;
    name = `${p.first_name} ${p.last_name}`;
    dob = p.date_of_birth;
  }
  const email = str(fd, 'email');
  const phone = str(fd, 'phone');
  const reason = str(fd, 'reason');
  const address = str(fd, 'address');
  if (!name) return { error: 'Enter the patient’s name.' };
  if (!phone) return { error: 'Enter a phone or WhatsApp number so we can reach you.' };
  if (email && !isEmail(email)) return { error: 'That email address doesn’t look right.' };
  if (!reason) return { error: 'Tell us briefly what the appointment is for.' };
  if (type.kind === 'home_visit' && !address) return { error: 'Enter the address, hotel or villa name, and room number.' };
  if (str(fd, 'consent') !== 'on') return { error: 'Please agree to us using your details to arrange your care.' };
  const redFlags = fd.getAll('red_flags').map(String).filter((f) => RED_FLAGS.includes(f));

  let result;
  try {
    result = await createAppointment({
      typeId: type.id,
      date: dateStr(fd, 'date') ?? undefined,
      time: str(fd, 'time') ?? undefined,
      etaMinutes: num(fd, 'eta') ?? 30,
      name,
      email: email ?? (portal ? user!.email : null),
      phone,
      dateOfBirth: dob,
      reason: reason.slice(0, 500),
      address,
      telehealthMode: str(fd, 'telehealth_mode') === 'video' ? 'video' : 'phone',
      redFlags,
      remindersWanted: type.kind !== 'walk_in' && str(fd, 'reminders') === 'on',
      patientId,
      familyId: portal?.familyId ?? null,
      source: portal ? 'portal' : 'web',
      clientIp: ip,
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await sendAppointmentEmail(result.id, 'booked');
  await notifyClinicOfBooking(result.id);
  redirect(`/book/manage/${result.token}?new=1`);
}

export async function rescheduleByToken(_prev: FormState, fd: FormData): Promise<FormState> {
  const appt = await getAppointmentByToken(str(fd, 'token') ?? '');
  if (!appt) return { error: 'Booking not found.' };
  const date = dateStr(fd, 'date');
  const time = str(fd, 'time');
  if (!date || !time) return { error: 'Choose a new date and time.' };
  try {
    await rescheduleAppointment(appt.id, date, time, {});
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await sendAppointmentEmail(appt.id, 'rescheduled');
  await notifyClinicOfBooking(appt.id, 'rescheduled');
  redirect(`/book/manage/${appt.manage_token}?moved=1`);
}

export async function cancelByToken(_prev: FormState, fd: FormData): Promise<FormState> {
  const appt = await getAppointmentByToken(str(fd, 'token') ?? '');
  if (!appt) return { error: 'Booking not found.' };
  try {
    await cancelAppointment(appt.id, str(fd, 'reason'), { who: 'patient' });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await sendAppointmentEmail(appt.id, 'cancelled');
  await notifyClinicOfBooking(appt.id, 'cancelled');
  redirect(`/book/manage/${appt.manage_token}?cancelled=1`);
}
