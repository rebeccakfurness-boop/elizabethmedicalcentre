'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { isClinical } from '@/lib/auth';
import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  getSlots,
  logAppointmentEvent,
  rescheduleAppointment,
} from '@/lib/appointments';
import { DAY_NAMES, validHours, type WeekHours } from '@/lib/booking-shared';
import { sql, transaction } from '@/lib/db';
import { isEmail, sendAppointmentEmail, sendDueReminders, type AppointmentEmailKind } from '@/lib/email';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { audit, requirePermission } from '@/lib/session';

const apptPath = (id: number) => `/dashboard/appointments/${id}`;

function revalidateAppt(id?: number) {
  revalidatePath('/dashboard/appointments');
  revalidatePath('/dashboard/clinic');
  revalidatePath('/dashboard');
  if (id) revalidatePath(apptPath(id));
}

/** Staff can see free slots without the online notice period (for phone bookings). */
export async function staffSlots(typeId: number, date: string): Promise<{ slots: string[]; note?: string }> {
  await requirePermission('viewPatients');
  return getSlots(Number(typeId), String(date), { staff: true });
}

export async function staffCreateAppointment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const typeId = num(fd, 'type_id');
  const patientId = num(fd, 'patient_id');
  let name = str(fd, 'name');
  let email = str(fd, 'email');
  let phone = str(fd, 'phone');
  let dob: string | null = dateStr(fd, 'date_of_birth');
  let familyId: number | null = null;
  if (patientId) {
    const [p] = await sql<{ first_name: string; last_name: string; email: string | null; phone: string | null; date_of_birth: string | null; family_id: number }>`
      SELECT first_name, last_name, email, phone, date_of_birth, family_id FROM patients WHERE id = ${patientId}`;
    if (!p) return { error: 'Patient not found.' };
    name = `${p.first_name} ${p.last_name}`;
    email = email ?? p.email;
    phone = phone ?? p.phone;
    dob = p.date_of_birth;
    familyId = p.family_id;
  }
  if (!typeId) return { error: 'Choose the appointment type.' };
  if (!name) return { error: 'Choose a patient or enter a name.' };
  if (email && !isEmail(email)) return { error: 'That email address doesn’t look right.' };
  const customTime = str(fd, 'custom_time');
  let result;
  try {
    result = await createAppointment({
      typeId,
      date: dateStr(fd, 'date') ?? undefined,
      time: customTime ?? str(fd, 'time') ?? undefined,
      etaMinutes: num(fd, 'eta') ?? 30,
      name,
      email,
      phone,
      dateOfBirth: dob,
      reason: str(fd, 'reason'),
      address: str(fd, 'address'),
      telehealthMode: str(fd, 'telehealth_mode') === 'video' ? 'video' : 'phone',
      remindersWanted: !!email,
      patientId,
      familyId,
      source: 'staff',
      createdBy: user.id,
      override: !!customTime,
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'create', 'appointment', result.id);
  if (email && str(fd, 'send_email') === 'on') await sendAppointmentEmail(result.id, 'booked');
  revalidateAppt(result.id);
  redirect(apptPath(result.id));
}

async function load(fd: FormData) {
  const id = num(fd, 'appointment_id');
  return id ? getAppointment(id) : null;
}

export async function confirmAppointment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  if (!a || a.status !== 'requested') return { error: 'Only requests can be confirmed.' };
  await sql`UPDATE appointments SET status = 'confirmed', updated_at = now() WHERE id = ${a.id}`;
  await logAppointmentEvent(a.id, 'confirmed', null, user.id);
  const emailed = await sendAppointmentEmail(a.id, 'confirmed');
  revalidateAppt(a.id);
  return { ok: emailed ? 'Confirmed and emailed to the patient.' : 'Confirmed. No email sent: let the patient know by phone or WhatsApp.' };
}

export async function staffReschedule(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  const date = dateStr(fd, 'date');
  const custom = str(fd, 'custom_time');
  const time = custom ?? str(fd, 'time');
  if (!a || !date || !time) return { error: 'Choose a new date and time.' };
  try {
    await rescheduleAppointment(a.id, date, time, { userId: user.id, staff: true, override: !!custom });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const emailed = str(fd, 'notify') === 'on' ? await sendAppointmentEmail(a.id, 'rescheduled') : false;
  revalidateAppt(a.id);
  return { ok: `Moved to ${date} ${time}.${emailed ? ' The patient has been emailed.' : ''}` };
}

export async function staffCancel(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  if (!a) return { error: 'Appointment not found.' };
  try {
    await cancelAppointment(a.id, str(fd, 'reason'), { userId: user.id, who: 'staff' });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const emailed = str(fd, 'notify') === 'on' ? await sendAppointmentEmail(a.id, 'cancelled') : false;
  revalidateAppt(a.id);
  return { ok: `Cancelled.${emailed ? ' The patient has been emailed.' : ''}` };
}

export async function markNoShow(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  if (!a || !['requested', 'confirmed'].includes(a.status)) return { error: 'This appointment can’t be changed.' };
  await sql`UPDATE appointments SET status = 'no_show', updated_at = now() WHERE id = ${a.id}`;
  await logAppointmentEvent(a.id, 'no_show', null, user.id);
  revalidateAppt(a.id);
  return { ok: 'Marked as did not attend.' };
}

const ENCOUNTER_TYPE = { clinic: 'appointment', home_visit: 'home_visit', telehealth: 'telemedicine', walk_in: 'walk_in' } as const;

/** Arrival: puts the patient on the clinic board as a visit, linked to this booking. */
export async function checkInAppointment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  if (!a || !['requested', 'confirmed'].includes(a.status)) return { error: 'This appointment can’t be checked in.' };
  if (!a.patient_id) return { error: 'Link the booking to a patient card first (below).' };
  const open = await sql`SELECT 1 FROM encounters WHERE patient_id = ${a.patient_id} AND status IN ('waiting', 'triaged', 'in_consultation')`;
  if (open.length) return { error: 'This patient is already on the clinic board.' };
  const encounterId = await transaction(async (q) => {
    const [enc] = await q<{ id: number }>`INSERT INTO encounters (patient_id, encounter_type, presenting_complaint, created_by)
      VALUES (${a.patient_id}, ${ENCOUNTER_TYPE[a.kind]}, ${a.reason ?? a.type_name}, ${user.id}) RETURNING id`;
    await q`UPDATE appointments SET status = 'checked_in', encounter_id = ${enc.id}, updated_at = now() WHERE id = ${a.id}`;
    await q`INSERT INTO appointment_events (appointment_id, user_id, kind, detail) VALUES (${a.id}, ${user.id}, 'checked_in', ${`visit ${enc.id}`})`;
    return enc.id;
  });
  await audit(user.id, 'check_in', 'encounter', encounterId, `appointment ${a.id}`);
  revalidateAppt(a.id);
  if (str(fd, 'then') === 'open' && isClinical(user.clinicalRole)) redirect(`/dashboard/encounters/${encounterId}`);
  return { ok: 'Checked in. They are on the clinic board.' };
}

export async function linkAppointmentPatient(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  const patientId = num(fd, 'patient_id');
  if (!a || !patientId) return { error: 'Choose a patient.' };
  const [p] = await sql<{ family_id: number }>`SELECT family_id FROM patients WHERE id = ${patientId}`;
  if (!p) return { error: 'Patient not found.' };
  await sql`UPDATE appointments SET patient_id = ${patientId}, family_id = ${p.family_id}, updated_at = now() WHERE id = ${a.id}`;
  await logAppointmentEvent(a.id, 'linked', `patient ${patientId}`, user.id);
  revalidateAppt(a.id);
  return { ok: 'Linked to the patient card.' };
}

/** New family account and patient card from what was typed into the booking form. */
export async function createPatientFromAppointment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('managePatients');
  const a = await load(fd);
  if (!a || a.patient_id) return { error: 'This booking already has a patient card.' };
  const parts = a.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : '';
  const first = parts.join(' ') || a.name.trim();
  const patientId = await transaction(async (q) => {
    const [f] = await q<{ id: number }>`INSERT INTO families (account_name, billing_email, phone, address)
      VALUES (${`${last || first} family`}, ${a.email}, ${a.phone}, ${a.kind === 'home_visit' ? a.address : null}) RETURNING id`;
    const [p] = await q<{ id: number }>`INSERT INTO patients (family_id, is_account_holder, relationship, first_name, last_name, date_of_birth, phone, email)
      VALUES (${f.id}, true, 'Account holder', ${first}, ${last || '-'}, ${a.date_of_birth}, ${a.phone}, ${a.email}) RETURNING id`;
    await q`UPDATE appointments SET patient_id = ${p.id}, family_id = ${f.id}, updated_at = now() WHERE id = ${a.id}`;
    return p.id;
  });
  await logAppointmentEvent(a.id, 'linked', `new patient card ${patientId}`, user.id);
  await audit(user.id, 'create_from_booking', 'patient', patientId);
  revalidateAppt(a.id);
  return { ok: 'Patient card created and linked. Check the details on the card.' };
}

export async function updateAppointmentDetails(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const a = await load(fd);
  if (!a) return { error: 'Appointment not found.' };
  const email = str(fd, 'email');
  if (email && !isEmail(email)) return { error: 'That email address doesn’t look right.' };
  const link = str(fd, 'video_link');
  if (link && !/^https:\/\//.test(link)) return { error: 'The video link must start with https://' };
  await sql`UPDATE appointments SET clinician_id = ${num(fd, 'clinician_id')}, video_link = ${link}, staff_notes = ${str(fd, 'staff_notes')},
    email = ${email}, phone = ${str(fd, 'phone')}, address = ${str(fd, 'address')}, reason = ${str(fd, 'reason')},
    reminders_wanted = ${str(fd, 'reminders_wanted') === 'on'}, updated_at = now() WHERE id = ${a.id}`;
  await logAppointmentEvent(a.id, 'updated', null, user.id);
  revalidateAppt(a.id);
  return { ok: 'Saved.' };
}

export async function resendAppointmentEmail(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission('viewPatients');
  const a = await load(fd);
  const kind = str(fd, 'kind') as AppointmentEmailKind;
  if (!a?.email) return { error: 'There’s no email address on this booking.' };
  if (!['booked', 'confirmed', 'reminder'].includes(kind)) return { error: 'Choose which email.' };
  const ok = await sendAppointmentEmail(a.id, kind);
  revalidateAppt(a.id);
  return ok ? { ok: `Sent to ${a.email}.` } : { error: 'The email couldn’t be sent. See the history below.' };
}

export async function sendRemindersNow(_prev: FormState, _fd: FormData): Promise<FormState> {
  const user = await requirePermission('viewPatients');
  const r = await sendDueReminders();
  await audit(user.id, 'send_reminders', 'appointment', null, `${r.sent} sent, ${r.failed} failed`);
  revalidateAppt();
  return r.failed ? { error: `${r.sent} sent, ${r.failed} couldn’t be sent (check email settings).` } : { ok: r.sent ? `${r.sent} reminders sent.` : 'No reminders due right now.' };
}

// ---------- Settings (admins) ----------

function readHours(fd: FormData, prefix: string): WeekHours {
  return DAY_NAMES.map((_, i) =>
    str(fd, `${prefix}closed_${i}`) === 'on' ? null : { open: str(fd, `${prefix}open_${i}`) ?? '08:00', close: str(fd, `${prefix}close_${i}`) ?? '17:00' }
  );
}

export async function saveBookingSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const hours = readHours(fd, '');
  if (!validHours(hours)) return { error: 'Check the opening hours: each day needs an opening time before its closing time.' };
  const notify = str(fd, 'booking_notify_email');
  if (notify && !isEmail(notify)) return { error: 'The notification email doesn’t look right.' };
  const link = str(fd, 'telehealth_video_link');
  if (link && !/^https:\/\//.test(link)) return { error: 'The video link must start with https://' };
  const maxDays = Math.min(Math.max(num(fd, 'booking_max_days_ahead') ?? 30, 1), 180);
  await sql`UPDATE clinic_settings SET booking_enabled = ${str(fd, 'booking_enabled') === 'on'}, booking_hours = ${JSON.stringify(hours)}::jsonb,
    booking_notify_email = ${notify}, booking_max_days_ahead = ${maxDays}, telehealth_video_link = ${link},
    reminders_enabled = ${str(fd, 'reminders_enabled') === 'on'} WHERE id = 1`;
  await audit(user.id, 'update', 'booking_settings', 1);
  revalidatePath('/dashboard/appointments/settings');
  revalidatePath('/book');
  revalidatePath('/');
  return { ok: 'Booking settings saved.' };
}

export async function saveAppointmentType(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing type.' };
  const name = str(fd, 'name');
  const duration = num(fd, 'duration_minutes');
  const capacity = num(fd, 'capacity');
  if (!name) return { error: 'Name the appointment type.' };
  if (!duration || duration < 5 || duration > 480) return { error: 'Length must be between 5 and 480 minutes.' };
  if (!capacity || capacity < 1) return { error: 'At least one booking must fit in each slot.' };
  const ownHours = str(fd, 'own_hours') === 'on';
  const hours = ownHours ? readHours(fd, `t${id}_`) : null;
  if (hours && !validHours(hours)) return { error: 'Check the hours for this type.' };
  await sql`UPDATE appointment_types SET name = ${name}, description = ${str(fd, 'description')}, duration_minutes = ${duration}, capacity = ${capacity},
    min_notice_minutes = ${Math.max(0, num(fd, 'min_notice_minutes') ?? 0)}, auto_confirm = ${str(fd, 'auto_confirm') === 'on'},
    price_note = ${str(fd, 'price_note')}, is_active = ${str(fd, 'is_active') === 'on'},
    hours = ${hours ? JSON.stringify(hours) : null}::jsonb WHERE id = ${id}`;
  await audit(user.id, 'update', 'appointment_type', id);
  revalidatePath('/dashboard/appointments/settings');
  revalidatePath('/book');
  return { ok: 'Saved.' };
}

export async function addClosure(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const date = dateStr(fd, 'closed_date');
  if (!date) return { error: 'Choose the date.' };
  await sql`INSERT INTO booking_closures (closed_date, reason) VALUES (${date}, ${str(fd, 'reason')})
    ON CONFLICT (closed_date) DO UPDATE SET reason = EXCLUDED.reason`;
  const [{ n }] = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM appointments
    WHERE status IN ('requested', 'confirmed') AND (starts_at AT TIME ZONE 'Asia/Makassar')::date = ${date}`;
  await audit(user.id, 'add_closure', 'booking_closure', null, date);
  revalidatePath('/dashboard/appointments/settings');
  return { ok: n ? `Closed. ${n} existing booking${n === 1 ? ' is' : 's are'} still on that day: move or cancel them in the diary.` : 'Closed for online booking.' };
}

export async function removeClosure(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('manageOperations');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing date.' };
  await sql`DELETE FROM booking_closures WHERE id = ${id}`;
  await audit(user.id, 'remove_closure', 'booking_closure', id);
  revalidatePath('/dashboard/appointments/settings');
  return { ok: 'Reopened.' };
}
