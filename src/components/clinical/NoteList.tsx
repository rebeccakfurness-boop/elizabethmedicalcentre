import Link from 'next/link';
import { addAddendum, changeNoteVisibility, deleteDraftNote } from '@/app/actions/clinical';
import { VisibilityBadge } from '@/components/clinical/Badges';
import { ActionForm } from '@/components/ui/ActionForm';
import { CLINICAL_ROLE_LABELS } from '@/lib/auth';
import { NOTE_TYPE_LABELS, type NoteRow } from '@/lib/clinical';
import { formatClinicTime } from '@/lib/format';

/** Notes already filtered by readableVisibilities; `clinical` controls the share/addendum tools. */
export function NoteList({ notes, viewerId, clinical, linkEncounters = false }: { notes: NoteRow[]; viewerId: number; clinical: boolean; linkEncounters?: boolean }) {
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <li key={n.id} className={`rounded-2xl border p-4 ${n.signed_at ? 'border-line' : 'border-dashed border-amber-400 bg-amber-50/40'}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
            <span>
              <strong className="text-ink">{NOTE_TYPE_LABELS[n.note_type]}</strong> · {n.author_name}
              {n.author_clinical_role ? ` (${CLINICAL_ROLE_LABELS[n.author_clinical_role]})` : ''} · {formatClinicTime(n.created_at)}
              {n.dictated ? ' · 🎙 dictated' : ''}
              {!n.signed_at ? ' · DRAFT' : ''}
              {linkEncounters && clinical && n.encounter_id ? <> · <Link href={`/dashboard/encounters/${n.encounter_id}`} className="text-teal underline">visit</Link></> : null}
            </span>
            <VisibilityBadge visibility={n.visibility} />
          </div>
          {n.subjective ? <p className="whitespace-pre-line text-sm"><strong>S:</strong> {n.subjective}</p> : null}
          {n.objective ? <p className="whitespace-pre-line text-sm"><strong>O:</strong> {n.objective}</p> : null}
          {n.assessment ? <p className="whitespace-pre-line text-sm"><strong>A:</strong> {n.assessment}</p> : null}
          {n.plan ? <p className="whitespace-pre-line text-sm"><strong>P:</strong> {n.plan}</p> : null}
          {n.body ? <p className="whitespace-pre-line text-sm">{n.body}</p> : null}
          {!clinical ? null : n.signed_at ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-teal">Share / addendum</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <ActionForm action={changeNoteVisibility} submitLabel="Update sharing" submitClassName="btn-ghost btn-sm">
                  <input type="hidden" name="note_id" value={n.id} />
                  <select name="visibility" defaultValue={n.visibility} className="input py-1.5 text-sm" aria-label="Who can see this note">
                    <option value="clinical">🔒 Clinical staff only</option>
                    <option value="staff">👥 All staff</option>
                    <option value="patient">🏠 Shared with patient</option>
                  </select>
                </ActionForm>
                <ActionForm action={addAddendum} submitLabel="Add addendum" submitClassName="btn-ghost btn-sm">
                  <input type="hidden" name="note_id" value={n.id} />
                  <textarea name="body" rows={2} className="input text-sm" placeholder="Correction or later information" aria-label="Addendum" />
                </ActionForm>
              </div>
            </details>
          ) : n.author_id === viewerId ? (
            <div className="mt-2">
              <ActionForm action={deleteDraftNote} submitLabel="Delete draft" submitClassName="text-xs text-ink-soft underline" inline confirm="Delete this draft note?">
                <input type="hidden" name="note_id" value={n.id} />
              </ActionForm>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
