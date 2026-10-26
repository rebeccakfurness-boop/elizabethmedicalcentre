import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableSlots, buildIcs, clinicInstant, clinicParts, DEFAULT_HOURS, validHours, weekdayOfDate } from '../src/lib/booking-shared';

const base = { hours: DEFAULT_HOURS, durationMinutes: 20, capacity: 1, minNoticeMinutes: 60, bookings: [], closed: false };

test('clinic time conversion', () => {
  const d = clinicInstant('2026-11-03', '09:20');
  assert.equal(d.toISOString(), '2026-11-03T01:20:00.000Z');
  assert.deepEqual(clinicParts(d), { date: '2026-11-03', time: '09:20', weekday: 2 });
  assert.equal(clinicParts(new Date('2026-11-03T17:30:00Z')).date, '2026-11-04'); // 01:30 next day in Lombok
  assert.equal(weekdayOfDate('2026-11-01'), 0);
});

test('slots fill the opening hours', () => {
  const slots = availableSlots({ ...base, date: '2026-11-03', now: new Date('2026-10-01T00:00:00Z') });
  assert.equal(slots[0], '08:00');
  assert.equal(slots.at(-1), '19:40'); // last 20-minute slot that ends by 20:00
  assert.equal(slots.length, 36);
  const sunday = availableSlots({ ...base, date: '2026-11-01', now: new Date('2026-10-01T00:00:00Z') });
  assert.equal(sunday[0], '09:00');
  assert.equal(sunday.at(-1), '16:40');
});

test('notice period hides slots that are too soon', () => {
  const now = clinicInstant('2026-11-03', '10:05');
  const slots = availableSlots({ ...base, date: '2026-11-03', now });
  assert.equal(slots[0], '11:20'); // 10:05 + 60 min -> first slot at or after 11:05
});

test('capacity counts overlapping bookings', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const b = (t: string, mins: number) => ({ start: clinicInstant('2026-11-03', t), end: new Date(clinicInstant('2026-11-03', t).getTime() + mins * 60000) });
  const one = availableSlots({ ...base, date: '2026-11-03', now, bookings: [b('08:20', 20)] });
  assert.ok(!one.includes('08:20') && one.includes('08:00') && one.includes('08:40'));
  const two = availableSlots({ ...base, capacity: 2, date: '2026-11-03', now, bookings: [b('08:20', 20)] });
  assert.ok(two.includes('08:20'));
  // A rescheduled 60-minute booking blocks three 20-minute slots.
  const long = availableSlots({ ...base, date: '2026-11-03', now, bookings: [b('09:00', 60)] });
  assert.ok(!long.includes('09:00') && !long.includes('09:20') && !long.includes('09:40') && long.includes('10:00'));
});

test('closed days and closures', () => {
  const hours = [...DEFAULT_HOURS];
  hours[2] = null;
  assert.deepEqual(availableSlots({ ...base, hours, date: '2026-11-03', now: new Date(0) }), []);
  assert.deepEqual(availableSlots({ ...base, closed: true, date: '2026-11-04', now: new Date(0) }), []);
  assert.equal(validHours(hours), true);
  assert.equal(validHours([...DEFAULT_HOURS.slice(0, 6), { open: '18:00', close: '09:00' }]), false);
});

test('calendar invite', () => {
  const ics = buildIcs({
    uid: 'appt-1@emc', sequence: 2, start: clinicInstant('2026-11-03', '09:20'), end: clinicInstant('2026-11-03', '09:40'),
    summary: 'Appointment, The Doctors', description: 'Line one\nLine, two; three', location: 'Kuta, Lombok',
  });
  assert.ok(ics.includes('DTSTART:20261103T012000Z'));
  assert.ok(ics.includes('SEQUENCE:2'));
  assert.ok(ics.includes(String.raw`DESCRIPTION:Line one\nLine\, two\; three`));
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  assert.ok(buildIcs({ uid: 'x', sequence: 3, start: new Date(0), end: new Date(0), summary: 's', description: '', location: '', cancelled: true }).includes('METHOD:CANCEL'));
});
