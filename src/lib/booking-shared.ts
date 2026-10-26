// Pure booking logic (no database): opening hours, free slots, calendar invites. Clinic time is WITA (UTC+8).

export type AppointmentKind = 'clinic' | 'home_visit' | 'telehealth' | 'walk_in';
export type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

export const KIND_LABELS: Record<AppointmentKind, string> = {
  clinic: 'At the clinic',
  home_visit: 'Home / hotel / villa visit',
  telehealth: 'Phone or video',
  walk_in: 'Urgent walk-in',
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Seen',
  cancelled: 'Cancelled',
  no_show: 'Did not attend',
};

/** Opening hours for Sunday (0) to Saturday (6); null means closed. */
export type DayHours = { open: string; close: string } | null;
export type WeekHours = DayHours[];

export const DEFAULT_HOURS: WeekHours = [
  { open: '09:00', close: '17:00' },
  { open: '08:00', close: '20:00' },
  { open: '08:00', close: '20:00' },
  { open: '08:00', close: '20:00' },
  { open: '08:00', close: '20:00' },
  { open: '08:00', close: '20:00' },
  { open: '08:00', close: '20:00' },
];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OFFSET_MS = 8 * 3600 * 1000;

/** A clinic-time date and time ('2026-11-03', '09:20') as a real instant. */
export function clinicInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

/** The clinic-time date and HH:MM of an instant. */
export function clinicParts(d: Date): { date: string; time: string; weekday: number } {
  const local = new Date(d.getTime() + OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16), weekday: local.getUTCDay() };
}

export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export function validHours(h: WeekHours): boolean {
  return h.length === 7 && h.every((d) => d === null || (/^\d{2}:\d{2}$/.test(d.open) && /^\d{2}:\d{2}$/.test(d.close) && toMinutes(d.open) < toMinutes(d.close)));
}

export interface SlotQuery {
  date: string;
  hours: WeekHours;
  durationMinutes: number;
  capacity: number;
  minNoticeMinutes: number;
  now: Date;
  /** Other bookings of this type that still hold a place. */
  bookings: { start: Date; end: Date }[];
  closed: boolean;
}

/**
 * Start times that are within opening hours, far enough ahead, and where fewer than `capacity`
 * bookings overlap. Slots step by the appointment length so the day fills neatly.
 */
export function availableSlots(q: SlotQuery): string[] {
  if (q.closed) return [];
  const day = q.hours[weekdayOfDate(q.date)];
  if (!day || q.durationMinutes <= 0 || q.capacity <= 0) return [];
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const earliest = q.now.getTime() + q.minNoticeMinutes * 60000;
  const out: string[] = [];
  for (let m = open; m + q.durationMinutes <= close; m += q.durationMinutes) {
    const start = clinicInstant(q.date, fromMinutes(m));
    if (start.getTime() < earliest) continue;
    const end = new Date(start.getTime() + q.durationMinutes * 60000);
    const overlapping = q.bookings.filter((b) => b.start < end && b.end > start).length;
    if (overlapping < q.capacity) out.push(fromMinutes(m));
  }
  return out;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Symptoms that mean "call an ambulance / come now", shown on the walk-in form. */
export const RED_FLAGS = [
  'Chest pain or pressure',
  'Severe difficulty breathing',
  'Unconscious, fainting or very drowsy',
  'Fitting / seizure',
  'Heavy bleeding that won’t stop',
  'Face, lips or tongue swelling, or a severe allergic reaction',
  'Weakness on one side, slurred speech or a drooping face',
  'Serious injury, e.g. a motorbike crash or a fall from height',
];

// ---------- Calendar invite (.ics) ----------

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines to 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export function buildIcs(input: {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  organizerEmail?: string | null;
  cancelled?: boolean;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Doctors Elizabeth Medical Centre//Bookings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(input.end)}`,
    `SUMMARY:${icsText(input.summary)}`,
    `DESCRIPTION:${icsText(input.description)}`,
    `LOCATION:${icsText(input.location)}`,
    ...(input.organizerEmail ? [`ORGANIZER:mailto:${input.organizerEmail}`] : []),
    `STATUS:${input.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(input.cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment reminder', 'TRIGGER:-PT2H', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function formatClinicDateTime(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });
}
