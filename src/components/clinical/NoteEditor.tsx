'use client';

import { useActionState, useState } from 'react';
import { saveNote } from '@/app/actions/clinical';
import { DictationField } from '@/components/clinical/DictationField';

const VIS = [
  { value: 'clinical', label: '🔒 Clinical staff only', help: 'Doctors, nurses, midwives and pharmacists.' },
  { value: 'staff', label: '👥 All staff', help: 'Also reception and admin. Practical information only.' },
  { value: 'patient', label: '🏠 Shared with patient', help: "Also visible in the family's patient portal. Write in plain language." },
];

export interface NoteDraft {
  id: number;
  note_type: string;
  visibility: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  body: string | null;
}

export function NoteEditor({
  patientId,
  encounterId,
  clinical,
  dictationEnabled,
  draft,
  defaultType = 'consultation',
}: {
  patientId: number;
  encounterId?: number | null;
  clinical: boolean;
  dictationEnabled: boolean;
  draft?: NoteDraft | null;
  defaultType?: string;
}) {
  const [state, action, pending] = useActionState(saveNote, {});
  const [type, setType] = useState(draft?.note_type ?? (clinical ? defaultType : 'admin'));
  const [visibility, setVisibility] = useState(draft?.visibility ?? (clinical ? 'clinical' : 'staff'));
  const [dictated, setDictated] = useState(false);
  const soap = type === 'consultation';
  const markDictated = () => setDictated(true);
  // A new note clears itself after saving so it can't be submitted twice.
  const [round, setRound] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok && !draft) {
      setRound((r) => r + 1);
      setDictated(false);
    }
  }
  const key = `${draft?.id ?? 'new'}-${type}-${round}`;

  return (
    <form action={action} className="space-y-3">
      {draft ? <input type="hidden" name="note_id" value={draft.id} /> : null}
      <input type="hidden" name="patient_id" value={patientId} />
      {encounterId ? <input type="hidden" name="encounter_id" value={encounterId} /> : null}
      <input type="hidden" name="dictated" value={String(dictated)} />
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label" htmlFor="note_type">Type</label>
          <select className="input w-auto" id="note_type" name="note_type" value={type} onChange={(e) => setType(e.target.value)} disabled={!clinical}>
            {clinical ? (
              <>
                <option value="consultation">Consultation (SOAP)</option>
                <option value="nursing">Nursing</option>
                <option value="procedure">Procedure</option>
                <option value="phone">Phone / message</option>
                <option value="visit_summary">Visit summary for patient</option>
              </>
            ) : null}
            <option value="admin">Admin</option>
          </select>
          {!clinical ? <input type="hidden" name="note_type" value="admin" /> : null}
        </div>
        <div className="min-w-60 flex-1">
          <label className="label" htmlFor="visibility">Who can see this</label>
          <select className="input" id="visibility" name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} disabled={!clinical}>
            {VIS.filter((v) => clinical || v.value === 'staff').map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-soft">{VIS.find((v) => v.value === visibility)?.help}</p>
        </div>
      </div>
      {soap ? (
        <div key={key} className="grid gap-3 md:grid-cols-2">
          <DictationField name="subjective" label="S · History" defaultValue={draft?.subjective} enabled={dictationEnabled} onDictated={markDictated} placeholder="What the patient tells you" />
          <DictationField name="objective" label="O · Examination" defaultValue={draft?.objective} enabled={dictationEnabled} onDictated={markDictated} placeholder="Findings, observations, results" />
          <DictationField name="assessment" label="A · Assessment" defaultValue={draft?.assessment} enabled={dictationEnabled} onDictated={markDictated} placeholder="Diagnosis / impression" />
          <DictationField name="plan" label="P · Plan" defaultValue={draft?.plan} enabled={dictationEnabled} onDictated={markDictated} placeholder="Treatment, advice, follow-up, safety-netting" />
        </div>
      ) : (
        <DictationField key={key} name="body" label="Note" defaultValue={draft?.body} rows={5} enabled={dictationEnabled} onDictated={markDictated} />
      )}
      {dictationEnabled ? <p className="text-[11px] text-ink-soft">Dictation uses your browser&rsquo;s speech service (in Chrome this sends audio to Google; Safari can transcribe on the device). Say &ldquo;full stop&rdquo;, &ldquo;comma&rdquo; or &ldquo;new line&rdquo;. Always read it back before signing.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="intent" value="sign" className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Sign note'}</button>
        {clinical ? <button type="submit" name="intent" value="draft" className="btn-ghost" disabled={pending}>Save draft</button> : null}
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-teal">{state.ok}</p> : null}
      </div>
    </form>
  );
}
