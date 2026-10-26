'use client';

import { useActionState, useState } from 'react';
import { addPrescriptionItem } from '@/app/actions/clinical';
import { allergyWarnings, DRUGS } from '@/clinical/drugs';

export function RxItemForm({ encounterId, allergies, ageYears, presetCode }: { encounterId: number; allergies: string | null; ageYears: number | null; presetCode?: string | null }) {
  const [state, action, pending] = useActionState(addPrescriptionItem, {});
  const empty = { drug_name: '', dose: '', frequency: '', duration: '', route: '', quantity: '', instructions: '' };
  const prefill = (d: (typeof DRUGS)[number] | undefined) =>
    d ? { ...empty, drug_name: d.name, frequency: d.defaultFrequency, duration: d.defaultDuration ?? '', route: d.defaultRoute } : empty;
  const [code, setCode] = useState(presetCode ?? '');
  const drug = DRUGS.find((d) => d.code === code);
  const [form, setForm] = useState(() => prefill(DRUGS.find((d) => d.code === presetCode)));
  const chooseDrug = (next: string) => {
    setCode(next);
    setForm({ ...prefill(DRUGS.find((d) => d.code === next)), instructions: form.instructions, quantity: form.quantity });
  };
  // Clear the form once an item has been added.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) {
      setCode('');
      setForm(empty);
    }
  }

  const warnings = allergyWarnings(form.drug_name || drug?.name || '', drug?.code ?? null, allergies);
  const isChild = ageYears != null && ageYears < 12;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form action={action} className="space-y-3 rounded-2xl bg-paper p-4">
      <input type="hidden" name="encounter_id" value={encounterId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="drug_code">Medicine</label>
          <select className="input" id="drug_code" name="drug_code" value={code} onChange={(e) => chooseDrug(e.target.value)}>
            <option value="">Other (type below)…</option>
            {DRUGS.map((d) => <option key={d.code} value={d.code}>{d.name}{d.clinicOnly ? ' (given in clinic)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="drug_name">Name as printed</label>
          <input className="input" id="drug_name" name="drug_name" value={form.drug_name} onChange={set('drug_name')} required />
        </div>
      </div>
      {drug ? (
        <div className="rounded-xl bg-white p-3 text-xs">
          <p><strong>Adult:</strong> {drug.adultDose}</p>
          {drug.childDose ? <p className={isChild ? 'font-semibold text-pulse' : ''}><strong>Child:</strong> {drug.childDose}</p> : null}
          {drug.cautions.map((c) => <p key={c} className="text-amber-800">⚠ {c}</p>)}
        </div>
      ) : null}
      {warnings.map((w) => (
        <p key={w.message} className={`rounded-xl px-3 py-2 text-sm ${w.severity === 'block' ? 'bg-red-100 font-semibold text-red-900' : 'bg-amber-50 text-amber-900'}`}>
          {w.severity === 'block' ? '⛔ Allergy: ' : '⚠ '}{w.message}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="lg:col-span-1"><label className="label" htmlFor="dose">Dose</label><input className="input" id="dose" name="dose" value={form.dose} onChange={set('dose')} placeholder={isChild ? 'e.g. 240 mg (15 mg/kg)' : 'e.g. 500 mg'} required /></div>
        <div className="lg:col-span-2"><label className="label" htmlFor="frequency">How often</label><input className="input" id="frequency" name="frequency" value={form.frequency} onChange={set('frequency')} required /></div>
        <div><label className="label" htmlFor="duration">For</label><input className="input" id="duration" name="duration" value={form.duration} onChange={set('duration')} placeholder="5 days" /></div>
        <div><label className="label" htmlFor="route">Route</label><input className="input" id="route" name="route" value={form.route} onChange={set('route')} placeholder="oral" /></div>
        <div><label className="label" htmlFor="quantity">Quantity</label><input className="input" id="quantity" name="quantity" value={form.quantity} onChange={set('quantity')} placeholder="15 tablets" /></div>
      </div>
      <div><label className="label" htmlFor="instructions">Extra instructions for the label</label><input className="input" id="instructions" name="instructions" value={form.instructions} onChange={set('instructions')} placeholder="e.g. with food" /></div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>{pending ? 'Adding…' : 'Add to prescription'}</button>
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-teal">{state.ok}</p> : null}
      </div>
    </form>
  );
}
