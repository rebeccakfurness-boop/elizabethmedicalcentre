'use client';

import { useActionState, useState } from 'react';
import { staffCreateAppointment, staffSlots } from '@/app/actions/appointments';
import { SlotPicker } from '@/components/booking/SlotPicker';
import type { AppointmentKind } from '@/lib/booking-shared';

export function StaffNewAppointment({
  types,
  dates,
  patients,
}: {
  types: { id: number; name: string; kind: AppointmentKind }[];
  dates: string[];
  patients: { id: number; label: string; email: string | null; phone: string | null }[];
}) {
  const [state, action, pending] = useActionState(staffCreateAppointment, {});
  const [typeId, setTypeId] = useState(types[0]?.id ?? 0);
  const [patientId, setPatientId] = useState<string>(patients.length === 1 ? String(patients[0].id) : '');
  const [custom, setCustom] = useState(false);
  const type = types.find((t) => t.id === typeId);
  const chosen = patients.find((p) => String(p.id) === patientId);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="type_id">Type</label>
          <select className="input" id="type_id" name="type_id" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="patient_id">Patient</label>
          <select className="input" id="patient_id" name="patient_id" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">New / not registered: type details below</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      {!patientId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="name">Name *</label><input className="input" id="name" name="name" /></div>
          <div><label className="label" htmlFor="date_of_birth">Date of birth</label><input className="input" id="date_of_birth" name="date_of_birth" type="date" /></div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="phone">Phone / WhatsApp</label><input className="input" id="phone" name="phone" key={`p${patientId}`} defaultValue={chosen?.phone ?? ''} /></div>
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" key={`e${patientId}`} defaultValue={chosen?.email ?? ''} /></div>
      </div>
      {type?.kind === 'walk_in' ? (
        <div>
          <label className="label" htmlFor="eta">Arriving in</label>
          <select className="input w-auto" id="eta" name="eta" defaultValue="30">
            <option value="0">Here now</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option>
          </select>
        </div>
      ) : type ? (
        <div className="space-y-3">
          {!custom ? <SlotPicker key={typeId} typeId={typeId} dates={dates} fetchSlots={staffSlots} /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="date">Date</label><input className="input" id="date" name="date" type="date" defaultValue={dates[0]} required /></div>
              <div><label className="label" htmlFor="custom_time">Time</label><input className="input" id="custom_time" name="custom_time" type="time" required /></div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="h-4 w-4 accent-teal" />
            Any time (outside free slots or double-book)
          </label>
        </div>
      ) : null}
      {type?.kind === 'home_visit' ? <div><label className="label" htmlFor="address">Address / hotel / villa and room</label><textarea className="input" id="address" name="address" rows={2} /></div> : null}
      {type?.kind === 'telehealth' ? (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="telehealth_mode" value="phone" defaultChecked className="accent-teal" /> Phone</label>
          <label className="flex items-center gap-2"><input type="radio" name="telehealth_mode" value="video" className="accent-teal" /> Video</label>
        </div>
      ) : null}
      <div><label className="label" htmlFor="reason">Reason</label><input className="input" id="reason" name="reason" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send_email" defaultChecked className="h-4 w-4 accent-teal" /> Email a confirmation (if there’s an email address)</label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-clay" disabled={pending}>{pending ? 'Booking…' : 'Book appointment'}</button>
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      </div>
    </form>
  );
}
