import 'server-only';
import { randomBytes } from 'crypto';
import { headers } from 'next/headers';
import { getClinicSettings } from '@/lib/billing';
import { query, sql, transaction } from '@/lib/db';
import {
  addDays,
  availableSlots,
  clinicInstant,
  clinicParts,
  DEFAULT_HOURS,
  type AppointmentKind,
  type AppointmentStatus,
  type WeekHours,
} from '@/lib/booking-shared';

export interface AppointmentType {
  id: number;
  code: string;
  name: string;
  kind: AppointmentKind;
  description: string | null;
  duration_minutes: number;
  capacity: number;
  min_notice_minutes: number;
  auto_confirm: boolean;
  price_note: string | null;
  hours: WeekHours | null;
  is_active: boolean;
  sort_order: number;
}

export interface Appointment {
  id: number;
  type_id: number;
  type_name: string;
  kind: AppointmentKind;
  duration_minutes: number;
  patient_id: number | null;
  patient_name: string | null;
  mrn: string | null;
  family_id: number | null;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  reason: string | null;
  address: string | null;
  telehealth_mode: 'phone' | 'video' | null;
  video_link: string | null;
  red_flags: string[];
  clinician_id: number | null;
  clinician_name: string | null;
  encounter_id: number | null;
  source: 'web' | 'portal' | 'staff';
  manage_token: string | null;
  reminders_wanted: boolean;
  reminder_sent_at: Date | null;
  ics_sequence: number;
  cancel_reason: string | null;
  staff_notes: string | null;
  created_at: Date;
}

/** Bookings in these states hold their place in the diary. */
export const HOLDING_STATUSES: AppointmentStatus[] = ['requested', 'confirmed', 'checked_in'];

export async function getAppointmentTypes(activeOnly = true): Promise<AppointmentType[]> {
  return activeOnly
    ? sql<AppointmentType>`SELECT * FROM appointment_types WHERE is_active ORDER BY sort_order, id`
    : sql<AppointmentType>`SELECT * FROM appointment_types ORDER BY sort_order, id`;
}

export async function getAppointmentType(id: number): Promise<AppointmentType | null> {
  return (await sql<AppointmentType>`SELECT * FROM appointment_types WHERE id = ${id}`)[0] ?? null;
}

export async function getBookingSettings() {
  const s = await getClinicSettings();
  return { ...s, hours: (s.booking_hours as WeekHours | null) ?? DEFAULT_HOURS };
}

export function hoursFor(type: AppointmentType, clinicHours: WeekHours): WeekHours {
  return type.hours ?? clinicHours;
}

export async function isClosed(date: string): Promise<string | null> {
  const [row] = await sql<{ reason: string | null }>`SELECT reason FROM booking_closures WHERE closed_date = ${date}`;
  return row ? row.reason ?? 'Closed' : null;
}

/** Free start times ('HH:MM', clinic time) for a type on a date. */
export async function getSlots(typeId: number, date: string, opts: { excludeId?: number; staff?: boolean } = {}): Promise<{ slots: string[]; note?: string }> {
  const [type, settings] = await Promise.all([getAppointmentType(typeId), getBookingSettings()]);
  if (!type || !type.is_active || type.kind === 'walk_in') return { slots: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] };
  const today = clinicParts(new Date()).date;
  if (date < today) return { slots: [], note: 'That date has passed.' };
  if (!opts.staff && date > addDays(today, settings.booking_max_days_ahead)) return { slots: [], note: `Bookings open ${settings.booking_max_days_ahead} days ahead.` };
  const closure = await isClosed(date);
  if (closure) return { slots: [], note: `Closed: ${closure}` };
  const dayStart = clinicInstant(date, '00:00');
  const dayEnd = clinicInstant(addDays(date, 1), '00:00');
  const bookings = await sql<{ start: Date; end: Date }>`
    SELECT starts_at AS start, ends_at AS end FROM appointments
    WHERE type_id = ${typeId} AND status = ANY(${HOLDING_STATUSES}) AND starts_at < ${dayEnd} AND ends_at > ${dayStart}
      AND id <> ${opts.excludeId ?? 0}`;
  const slots = availableSlots({
    date,
    hours: hoursFor(type, settings.hours),
    durationMinutes: type.duration_minutes,
    capacity: type.capacity,
    minNoticeMinutes: opts.staff ? 0 : type.min_notice_minutes,
    now: new Date(),
    bookings,
    closed: false,
  });
  return { slots, note: slots.length ? undefined : 'No times left on this day.' };
}

const APPT_SELECT = `
  SELECT a.*, t.name AS type_name, t.kind, t.duration_minutes, p.first_name || ' ' || p.last_name AS patient_name, p.mrn, u.name AS clinician_name
  FROM appointments a
  JOIN appointment_types t ON t.id = a.type_id
  LEFT JOIN patients p ON p.id = a.patient_id
  LEFT JOIN users u ON u.id = a.clinician_id`;

export async function getAppointment(id: number): Promise<Appointment | null> {
  return (await query<Appointment>(`${APPT_SELECT} WHERE a.id = $1`, [id]))[0] ?? null;
}

export async function getAppointmentByToken(token: string): Promise<Appointment | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  return (await query<Appointment>(`${APPT_SELECT} WHERE a.manage_token = $1`, [token]))[0] ?? null;
}

export async function listAppointments(fromDate: string, toDate: string): Promise<Appointment[]> {
  return query<Appointment>(`${APPT_SELECT} WHERE a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at, a.id`, [
    clinicInstant(fromDate, '00:00'),
    clinicInstant(addDays(toDate, 1), '00:00'),
  ]);
}

export async function listPendingRequests(): Promise<Appointment[]> {
  return query<Appointment>(`${APPT_SELECT} WHERE a.status = 'requested' AND a.ends_at > now() ORDER BY a.starts_at`);
}

export async function getPatientAppointments(patientId: number): Promise<Appointment[]> {
  return query<Appointment>(`${APPT_SELECT} WHERE a.patient_id = $1 ORDER BY a.starts_at DESC LIMIT 50`, [patientId]);
}

export async function getFamilyAppointments(familyId: number): Promise<Appointment[]> {
  return query<Appointment>(
    `${APPT_SELECT} WHERE (a.family_id = $1 OR p.family_id = $1) AND a.starts_at > now() - interval '60 days' ORDER BY a.starts_at DESC`,
    [familyId]
  );
}

/** Today's bookings and walk-ins that haven't arrived yet, for the clinic board. */
export async function getExpectedToday(): Promise<Appointment[]> {
  const today = clinicParts(new Date()).date;
  return query<Appointment>(
    `${APPT_SELECT} WHERE a.status IN ('requested', 'confirmed') AND a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at`,
    [clinicInstant(today, '00:00'), clinicInstant(addDays(today, 1), '00:00')]
  );
}

export async function getAppointmentEvents(id: number) {
  return sql<{ id: number; kind: string; detail: string | null; created_at: Date; user_name: string | null }>`
    SELECT e.id, e.kind, e.detail, e.created_at, u.name AS user_name FROM appointment_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.appointment_id = ${id} ORDER BY e.created_at DESC, e.id DESC`;
}

export async function logAppointmentEvent(id: number, kind: string, detail: string | null, userId: number | null = null) {
  await sql`INSERT INTO appointment_events (appointment_id, user_id, kind, detail) VALUES (${id}, ${userId}, ${kind}, ${detail})`;
}

export function newManageToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
  } catch {
    // Outside a request (e.g. scripts).
  }
  return 'https://elizabethmedicalcentre.com';
}

export interface NewBooking {
  typeId: number;
  date?: string;
  time?: string;
  /** Walk-ins: minutes until they arrive. */
  etaMinutes?: number;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  reason: string | null;
  address: string | null;
  telehealthMode: 'phone' | 'video' | null;
  redFlags?: string[];
  remindersWanted: boolean;
  patientId?: number | null;
  familyId?: number | null;
  source: 'web' | 'portal' | 'staff';
  createdBy?: number | null;
  clientIp?: string | null;
  /** Staff can book outside the free slots (double-book, after hours). */
  override?: boolean;
}

/**
 * Creates a booking. A transaction-level lock per appointment type means two people can't take
 * the last place in the same slot at the same moment.
 */
export async function createAppointment(b: NewBooking): Promise<{ id: number; token: string; status: AppointmentStatus }> {
  const type = await getAppointmentType(b.typeId);
  if (!type || (!type.is_active && b.source !== 'staff')) throw new Error('Choose an appointment type.');
  const token = newManageToken();
  let start: Date;
  if (type.kind === 'walk_in') {
    start = new Date(Date.now() + Math.max(0, Math.min(b.etaMinutes ?? 30, 240)) * 60000);
  } else {
    if (!b.date || !b.time || !/^\d{2}:\d{2}$/.test(b.time)) throw new Error('Choose a date and time.');
    start = clinicInstant(b.date, b.time);
  }
  const end = new Date(start.getTime() + type.duration_minutes * 60000);
  const status: AppointmentStatus = type.auto_confirm || b.source === 'staff' ? 'confirmed' : 'requested';

  const id = await transaction(async (q) => {
    await q`SELECT pg_advisory_xact_lock(4242, ${type.id})`;
    if (type.kind !== 'walk_in' && !b.override) {
      const { slots, note } = await getSlots(type.id, b.date!, { staff: b.source === 'staff' });
      if (!slots.includes(b.time!)) throw new Error(note && !slots.length ? note : 'Sorry, that time has just been taken. Please choose another.');
    }
    const [row] = await q<{ id: number }>`
      INSERT INTO appointments (type_id, patient_id, family_id, starts_at, ends_at, status, name, email, phone, date_of_birth, reason, address,
        telehealth_mode, red_flags, source, manage_token, reminders_wanted, created_by, client_ip)
      VALUES (${type.id}, ${b.patientId ?? null}, ${b.familyId ?? null}, ${start}, ${end}, ${status}, ${b.name}, ${b.email}, ${b.phone},
        ${b.dateOfBirth}, ${b.reason}, ${b.address}, ${type.kind === 'telehealth' ? b.telehealthMode ?? 'phone' : null}, ${b.redFlags ?? []},
        ${b.source}, ${token}, ${b.remindersWanted}, ${b.createdBy ?? null}, ${b.clientIp ?? null})
      RETURNING id`;
    await q`INSERT INTO appointment_events (appointment_id, user_id, kind, detail) VALUES (${row.id}, ${b.createdBy ?? null}, 'booked', ${`${status} via ${b.source}`})`;
    return row.id;
  });
  return { id, token, status };
}

export async function rescheduleAppointment(id: number, date: string, time: string, opts: { userId?: number | null; staff?: boolean; override?: boolean }) {
  const appt = await getAppointment(id);
  if (!appt || !['requested', 'confirmed'].includes(appt.status)) throw new Error('This appointment can’t be moved.');
  if (appt.kind === 'walk_in') throw new Error('Walk-ins don’t have a set time.');
  const start = clinicInstant(date, time);
  const end = new Date(start.getTime() + appt.duration_minutes * 60000);
  await transaction(async (q) => {
    await q`SELECT pg_advisory_xact_lock(4242, ${appt.type_id})`;
    if (!opts.override) {
      const { slots } = await getSlots(appt.type_id, date, { excludeId: id, staff: opts.staff });
      if (!slots.includes(time)) throw new Error('That time isn’t available. Please choose another.');
    }
    await q`UPDATE appointments SET starts_at = ${start}, ends_at = ${end}, reminder_sent_at = NULL, ics_sequence = ics_sequence + 1, updated_at = now() WHERE id = ${id}`;
    await q`INSERT INTO appointment_events (appointment_id, user_id, kind, detail) VALUES (${id}, ${opts.userId ?? null}, 'rescheduled', ${`from ${clinicParts(appt.starts_at).date} ${clinicParts(appt.starts_at).time} to ${date} ${time}`})`;
  });
}

export async function cancelAppointment(id: number, reason: string | null, by: { userId?: number | null; who: 'patient' | 'staff' }) {
  const rows = await sql`UPDATE appointments SET status = 'cancelled', cancel_reason = ${reason}, ics_sequence = ics_sequence + 1, updated_at = now()
    WHERE id = ${id} AND status IN ('requested', 'confirmed') RETURNING id`;
  if (!rows.length) throw new Error('This appointment can’t be cancelled.');
  await logAppointmentEvent(id, 'cancelled', `by ${by.who}${reason ? `: ${reason}` : ''}`, by.userId ?? null);
}

/** Bookings due a reminder: confirmed, starting in the next 36 hours, booked more than 12 hours before. */
export async function getDueReminders(): Promise<number[]> {
  const rows = await sql<{ id: number }>`
    SELECT id FROM appointments
    WHERE status = 'confirmed' AND reminders_wanted AND email IS NOT NULL AND reminder_sent_at IS NULL
      AND starts_at > now() AND starts_at < now() + interval '36 hours' AND created_at < starts_at - interval '12 hours'
    ORDER BY starts_at`;
  return rows.map((r) => r.id);
}
