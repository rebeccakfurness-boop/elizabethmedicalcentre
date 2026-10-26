'use client';

import { useActionState, useState } from 'react';
import { submitBooking } from '@/app/actions/booking';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { KIND_LABELS, RED_FLAGS, type AppointmentKind } from '@/lib/booking-shared';

export interface BookableType {
  id: number;
  name: string;
  kind: AppointmentKind;
  description: string | null;
  duration_minutes: number;
  price_note: string | null;
}

const ICONS: Record<AppointmentKind, string> = { clinic: '🩺', home_visit: '🏠', telehealth: '📞', walk_in: '🚑' };

export function BookingForm({
  types,
  dates,
  clinicPhone,
  family,
  defaultEmail,
  initialTypeId,
}: {
  types: BookableType[];
  dates: string[];
  clinicPhone: string | null;
  family: { id: number; name: string }[] | null;
  defaultEmail: string | null;
  initialTypeId?: number;
}) {
  const [state, action, pending] = useActionState(submitBooking, {});
  const [typeId, setTypeId] = useState<number | null>(initialTypeId ?? null);
  const [flags, setFlags] = useState<string[]>([]);
  const type = types.find((t) => t.id === typeId) ?? null;

  return (
    <form action={action} className="space-y-6">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <fieldset>
        <legend className="card-title mb-3">1. What do you need?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {types.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer gap-3 rounded-2xl border-2 bg-white p-4 transition ${t.id === typeId ? 'border-teal shadow-soft' : 'border-line hover:border-teal/50'} ${t.kind === 'walk_in' ? 'sm:col-span-2' : ''}`}
            >
              <input type="radio" name="type_id" value={t.id} checked={t.id === typeId} onChange={() => setTypeId(t.id)} className="sr-only" />
              <span className="text-2xl" aria-hidden="true">{ICONS[t.kind]}</span>
              <span>
                <span className="block font-semibold text-pulse">{t.name}</span>
                <span className="block text-sm text-ink-soft">{t.description}</span>
                <span className="mt-1 block text-xs text-ink-soft">
                  {t.kind === 'walk_in' ? 'No appointment needed' : `${t.duration_minutes} minutes`}{t.price_note ? ` · ${t.price_note}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {type ? (
        <>
          {type.kind === 'walk_in' ? (
            <fieldset className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
              <legend className="px-1 font-semibold text-red-900">Do you have any of these right now?</legend>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {RED_FLAGS.map((f) => (
                  <label key={f} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="red_flags"
                      value={f}
                      checked={flags.includes(f)}
                      onChange={(e) => setFlags(e.target.checked ? [...flags, f] : flags.filter((x) => x !== f))}
                      className="mt-0.5 h-4 w-4 accent-red-600"
                    />
                    {f}
                  </label>
                ))}
              </div>
              {flags.length ? (
                <div role="alert" className="mt-4 rounded-xl bg-red-600 p-4 text-white">
                  <p className="text-lg font-bold">Call 119 for an ambulance now, or go to the nearest emergency department.</p>
                  <p className="mt-1 text-sm">If you are close by, come straight to the clinic{clinicPhone ? ` and call us on ${clinicPhone}` : ''}. Don’t wait to fill in this form.</p>
                </div>
              ) : null}
              <div className="mt-4">
                <label className="label" htmlFor="eta">When will you get here?</label>
                <select className="input w-auto" id="eta" name="eta" defaultValue="30">
                  <option value="10">In about 10 minutes</option>
                  <option value="30">In about 30 minutes</option>
                  <option value="60">In about an hour</option>
                  <option value="120">In about 2 hours</option>
                </select>
              </div>
            </fieldset>
          ) : (
            <fieldset>
              <legend className="card-title mb-3">2. Choose a time</legend>
              <SlotPicker key={type.id} typeId={type.id} dates={dates} />
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="card-title mb-3">{type.kind === 'walk_in' ? '2' : '3'}. Your details</legend>
            {family ? (
              <div>
                <label className="label" htmlFor="patient_id">Who is the appointment for?</label>
                <select className="input" id="patient_id" name="patient_id" required defaultValue={family[0]?.id}>
                  {family.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="name">Patient’s full name *</label><input className="input" id="name" name="name" required autoComplete="name" /></div>
                <div><label className="label" htmlFor="date_of_birth">Date of birth</label><input className="input" id="date_of_birth" name="date_of_birth" type="date" /></div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="phone">Phone / WhatsApp *</label><input className="input" id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="+62 or your home number" /></div>
              <div><label className="label" htmlFor="email">Email (for confirmation and reminders)</label><input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={defaultEmail ?? ''} /></div>
            </div>
            {type.kind === 'home_visit' ? (
              <div>
                <label className="label" htmlFor="address">Where should the doctor come? *</label>
                <textarea className="input" id="address" name="address" rows={2} required placeholder="Hotel or villa name, room number, street, Google Maps link" />
              </div>
            ) : null}
            {type.kind === 'telehealth' ? (
              <fieldset>
                <legend className="label">How would you like to talk?</legend>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="telehealth_mode" value="phone" defaultChecked className="accent-teal" /> Phone call</label>
                  <label className="flex items-center gap-2"><input type="radio" name="telehealth_mode" value="video" className="accent-teal" /> Video call</label>
                </div>
              </fieldset>
            ) : null}
            <div>
              <label className="label" htmlFor="reason">What is it for? *</label>
              <textarea className="input" id="reason" name="reason" rows={2} required maxLength={500} placeholder="e.g. Fever for 3 days, ear pain after surfing, travel vaccinations" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-teal" />
              <span>I agree to The Doctors – Elizabeth Medical Centre using these details to arrange my care and contact me about this appointment.</span>
            </label>
            {type.kind !== 'walk_in' ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="reminders" defaultChecked className="mt-0.5 h-4 w-4 accent-teal" />
                <span>Email me a reminder the day before.</span>
              </label>
            ) : null}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-clay" disabled={pending}>
              {pending ? 'Booking…' : type.kind === 'walk_in' ? 'Tell the clinic I’m coming' : type.kind === 'home_visit' ? 'Request home visit' : 'Book appointment'}
            </button>
            {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
          </div>
          <p className="text-xs text-ink-soft">{KIND_LABELS[type.kind]}. Times are Lombok time (WITA, UTC+8).</p>
        </>
      ) : null}
    </form>
  );
}
