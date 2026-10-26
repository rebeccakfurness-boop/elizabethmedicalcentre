'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveTriage } from '@/app/actions/clinical';
import { computeTriage, DISCRIMINATORS, TRIAGE_INFO, TRIAGE_ORDER, worst, type TriageCategory, type Vitals } from '@/clinical/triage';

const n = (s: string) => (s.trim() === '' ? null : Number(s));

export function TriageForm({
  encounterId,
  ageYears,
  protocolOptions,
  suggestedProtocol,
  approved,
}: {
  encounterId: number;
  ageYears: number | null;
  protocolOptions: { slug: string; title: string }[];
  suggestedProtocol: string | null;
  approved: boolean;
}) {
  const [state, action, pending] = useActionState(saveTriage, {});
  const [v, setV] = useState<Record<string, string>>({});
  const [avpu, setAvpu] = useState<Vitals['avpu']>('alert');
  const [mobility, setMobility] = useState<Vitals['mobility']>('walking');
  const [trauma, setTrauma] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [override, setOverride] = useState<TriageCategory | ''>('');

  const result = useMemo(
    () =>
      computeTriage(
        {
          ageYears,
          heartRate: n(v.heart_rate ?? ''),
          respRate: n(v.resp_rate ?? ''),
          systolicBp: n(v.systolic_bp ?? ''),
          temperature: n(v.temperature ?? ''),
          spo2: n(v.spo2 ?? ''),
          glucose: n(v.glucose ?? ''),
          painScore: n(v.pain_score ?? ''),
          avpu,
          mobility,
          trauma,
        },
        codes
      ),
    [v, avpu, mobility, trauma, codes, ageYears]
  );
  const final = override ? worst(override, result.category) : result.category;
  const info = TRIAGE_INFO[final];
  const groups = Array.from(new Set(DISCRIMINATORS.map((d) => d.group)));
  const field = (name: string, label: string, unit: string, step = '1') => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-1">
        <input className="input py-2" id={name} name={name} type="number" inputMode="decimal" step={step} value={v[name] ?? ''} onChange={(e) => setV({ ...v, [name]: e.target.value })} />
        <span className="w-12 text-xs text-ink-soft">{unit}</span>
      </div>
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="encounter_id" value={encounterId} />
      {!approved ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Triage rules not yet approved by the medical director. Use your clinical judgement.</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {field('heart_rate', 'Heart rate', '/min')}
        {field('resp_rate', 'Breathing rate', '/min')}
        {field('systolic_bp', 'Systolic BP', 'mmHg')}
        {field('diastolic_bp', 'Diastolic BP', 'mmHg')}
        {field('temperature', 'Temperature', '°C', '0.1')}
        {field('spo2', 'SpO₂', '%')}
        {field('glucose', 'Glucose', 'mmol/L', '0.1')}
        {field('pain_score', 'Pain (0–10)', '/10')}
        {field('weight_kg', 'Weight', 'kg', '0.1')}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="avpu">Consciousness (AVPU)</label>
          <select className="input" id="avpu" name="avpu" value={avpu ?? ''} onChange={(e) => setAvpu(e.target.value as Vitals['avpu'])}>
            <option value="alert">Alert</option>
            <option value="confused">Confused</option>
            <option value="voice">Responds to voice</option>
            <option value="pain">Responds to pain</option>
            <option value="unresponsive">Unresponsive</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mobility">Mobility</label>
          <select className="input" id="mobility" name="mobility" value={mobility ?? ''} onChange={(e) => setMobility(e.target.value as Vitals['mobility'])}>
            <option value="walking">Walking</option>
            <option value="with_help">With help</option>
            <option value="stretcher">Stretcher / immobile</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="trauma" checked={trauma} onChange={(e) => setTrauma(e.target.checked)} className="h-4 w-4 accent-teal" /> Injury / trauma
        </label>
      </div>

      <details className="rounded-2xl border border-line p-4" open>
        <summary className="cursor-pointer font-label text-xs font-bold uppercase tracking-wider text-clay">Clinical signs (tick any present)</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <fieldset key={g}>
              <legend className="mb-1 font-label text-[11px] font-bold uppercase tracking-wider text-ink-soft">{g}</legend>
              {DISCRIMINATORS.filter((d) => d.group === g).map((d) => (
                <label key={d.code} className="flex items-start gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    name="discriminators"
                    value={d.code}
                    checked={codes.includes(d.code)}
                    onChange={(e) => setCodes(e.target.checked ? [...codes, d.code] : codes.filter((c) => c !== d.code))}
                    className="mt-0.5 h-4 w-4 accent-teal"
                  />
                  <span><span className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${TRIAGE_INFO[d.category].className}`} />{d.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>

      <div className={`rounded-2xl p-4 ${info.className}`} role="status" aria-live="polite">
        <p className="font-headline text-2xl font-extrabold">{final.toUpperCase()} · {info.label}</p>
        <p className="text-sm opacity-90">See {info.target.toLowerCase()} · {result.scoredAs === 'child' ? 'paediatric ranges' : result.tews != null ? `TEWS ${result.tews}` : 'TEWS incomplete'}</p>
        {result.reasons.length ? <ul className="mt-2 list-disc pl-5 text-xs opacity-90">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">Raise category (clinical judgement)</label>
          <select className="input" id="category" name="category" value={override} onChange={(e) => setOverride(e.target.value as TriageCategory | '')}>
            <option value="">Use suggested ({result.category})</option>
            {TRIAGE_ORDER.filter((c) => TRIAGE_ORDER.indexOf(c) < TRIAGE_ORDER.indexOf(result.category)).map((c) => (
              <option key={c} value={c}>{c.toUpperCase()} · {TRIAGE_INFO[c].label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-soft">You can raise the category but not lower it below the score.</p>
        </div>
        <div>
          <label className="label" htmlFor="protocol_slug">Protocol to follow</label>
          <select className="input" id="protocol_slug" name="protocol_slug" defaultValue={suggestedProtocol ?? ''}>
            <option value="">None / decide later</option>
            {protocolOptions.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="triage_note">Triage note (clinical staff only)</label>
        <textarea className="input" id="triage_note" name="triage_note" rows={2} placeholder="Brief history, first aid given" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-clay" disabled={pending}>{pending ? 'Saving…' : `Save triage (${final.toUpperCase()})`}</button>
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-teal">{state.ok}</p> : null}
      </div>
    </form>
  );
}
