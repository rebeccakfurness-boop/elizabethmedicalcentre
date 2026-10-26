import Link from 'next/link';
import type { NoteRow, PrescriptionItemRow, PrescriptionRow } from '@/lib/clinical';
import { NOTE_TYPE_LABELS } from '@/lib/clinical';
import { formatDate } from '@/lib/format';

type Named<T> = T & { patient_name: string };

/** Only notes a clinician chose to share, and issued prescriptions. */
export function FromYourDoctor({ notes, prescriptions, items, showNames }: { notes: Named<NoteRow>[]; prescriptions: Named<PrescriptionRow>[]; items: PrescriptionItemRow[]; showNames: boolean }) {
  if (!notes.length && !prescriptions.length) return null;
  return (
    <section className="card">
      <h2 className="card-title mb-3">From your doctor</h2>
      {prescriptions.length ? (
        <>
          <h3 className="mb-2 font-semibold text-pulse">Prescriptions</h3>
          <ul className="mb-5 divide-y divide-line">
            {prescriptions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold">{formatDate(r.issued_at)}</span>
                  {showNames ? <span className="text-ink-soft"> · {r.patient_name}</span> : null}
                  <span className="block text-ink-soft">{items.filter((i) => i.prescription_id === r.id).map((i) => i.drug_name).join(', ')}</span>
                </span>
                <Link href={`/print/prescription/${r.id}`} target="_blank" className="btn-ghost btn-sm">Medicine information</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {notes.length ? (
        <>
          <h3 className="mb-2 font-semibold text-pulse">Visit summaries and advice</h3>
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-2xl bg-paper p-4 text-sm">
                <p className="mb-1 text-xs text-ink-soft">
                  {formatDate(n.created_at)} · {NOTE_TYPE_LABELS[n.note_type]} · {n.author_name}{showNames ? ` · for ${n.patient_name}` : ''}
                </p>
                {n.assessment ? <p className="whitespace-pre-line"><strong>Assessment:</strong> {n.assessment}</p> : null}
                {n.plan ? <p className="whitespace-pre-line"><strong>Plan:</strong> {n.plan}</p> : null}
                {n.body ? <p className="whitespace-pre-line">{n.body}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-4 text-xs text-ink-soft">If you feel worse or are worried, contact the clinic. In an emergency call 119 or 112.</p>
    </section>
  );
}
