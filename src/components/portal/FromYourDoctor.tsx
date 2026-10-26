import Link from 'next/link';
import type { NoteRow, PrescriptionItemRow, PrescriptionRow } from '@/lib/clinical';
import { NOTE_TYPE_LABELS } from '@/lib/clinical';
import { formatDate } from '@/lib/format';
import type { LabAttachmentRow, LabOrderRow, LabResultRow } from '@/lib/labs';
import { testNames } from '@/lib/labs';
import type { ReferralRow } from '@/lib/referrals';
import { REFERRAL_TEMPLATES_BY_SLUG } from '@/clinical/referrals';

type Named<T> = T & { patient_name: string };

/** Only notes a clinician chose to share, and issued prescriptions. */
export interface PortalLabs {
  orders: LabOrderRow[];
  results: LabResultRow[];
  attachments: LabAttachmentRow[];
}

export function FromYourDoctor({
  notes,
  prescriptions,
  items,
  labs,
  referrals,
  showNames,
}: {
  notes: Named<NoteRow>[];
  prescriptions: Named<PrescriptionRow>[];
  items: PrescriptionItemRow[];
  labs: PortalLabs;
  referrals: ReferralRow[];
  showNames: boolean;
}) {
  if (!notes.length && !prescriptions.length && !labs.orders.length && !referrals.length) return null;
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
      {labs.orders.length ? (
        <>
          <h3 className="mb-2 font-semibold text-pulse">Test results</h3>
          <ul className="mb-5 space-y-3">
            {labs.orders.map((o) => {
              const rs = labs.results.filter((r) => r.order_id === o.id);
              const files = labs.attachments.filter((a) => a.order_id === o.id);
              return (
                <li key={o.id} className="rounded-2xl bg-paper p-4 text-sm">
                  <p className="mb-1 text-xs text-ink-soft">
                    {formatDate(o.collected_at ?? o.created_at)} · {testNames(o)}{showNames ? ` · ${o.first_name} ${o.last_name}` : ''} · reviewed by {o.reviewed_by_name}
                  </p>
                  {o.patient_comment ? <p className="mb-2 whitespace-pre-line font-semibold">{o.patient_comment}</p> : null}
                  {rs.length ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {rs.map((r) => (
                          <tr key={r.id} className="border-t border-line/60">
                            <td className="py-1">{r.name}</td>
                            <td className={`py-1 ${r.flag ? 'font-semibold' : ''}`}>{r.value}{r.unit ? ` ${r.unit}` : ''}</td>
                            <td className="py-1 text-xs text-ink-soft">{r.ref_range ? `normal ${r.ref_range}` : ''}</td>
                            <td className="py-1 text-xs">{r.flag === 'H' || r.flag === 'HH' ? 'High' : r.flag === 'L' || r.flag === 'LL' ? 'Low' : r.flag === 'A' ? 'Outside normal' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {files.map((f) => (
                    <a key={f.id} href={`/api/files/${f.file_id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-teal underline">📄 Full lab report</a>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {referrals.length ? (
        <>
          <h3 className="mb-2 font-semibold text-pulse">Referral letters</h3>
          <ul className="mb-5 divide-y divide-line">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold">{formatDate(r.finalised_at ?? r.created_at)}</span>
                  {showNames ? <span className="text-ink-soft"> · {r.first_name} {r.last_name}</span> : null}
                  <span className="block text-ink-soft">{REFERRAL_TEMPLATES_BY_SLUG.get(r.template)?.title} to {r.recipient_organisation ?? r.recipient_name}</span>
                </span>
                <a href={`/api/referrals/${r.id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Letter (PDF)</a>
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
