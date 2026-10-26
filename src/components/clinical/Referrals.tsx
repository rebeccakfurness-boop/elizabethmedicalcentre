import Link from 'next/link';
import { createReferral } from '@/app/actions/referrals';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { formatClinicTime } from '@/lib/format';
import { REFERRAL_STATUS_LABELS, type ReferralRow } from '@/lib/referrals';
import { REFERRAL_TEMPLATES, REFERRAL_TEMPLATES_BY_SLUG, URGENCY_LABELS } from '@/clinical/referrals';

export function ReferralStatusBadge({ status }: { status: ReferralRow['status'] }) {
  const tone = status === 'draft' ? 'amber' : status === 'cancelled' ? 'stone' : status === 'completed' ? 'teal' : 'clay';
  return <Pill tone={tone}>{REFERRAL_STATUS_LABELS[status]}</Pill>;
}

/** Choose a template; the letter opens pre-filled from the visit. */
export function NewReferralForm({ patientId, encounterId }: { patientId: number; encounterId?: number | null }) {
  return (
    <ActionForm action={createReferral} submitLabel="Write referral" submitClassName="btn-clay btn-sm">
      <input type="hidden" name="patient_id" value={patientId} />
      {encounterId ? <input type="hidden" name="encounter_id" value={encounterId} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {REFERRAL_TEMPLATES.map((t, i) => (
          <label key={t.slug} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal-soft">
            <input type="radio" name="template" value={t.slug} defaultChecked={i === 0} className="mt-1 accent-teal" />
            <span>
              <strong>{t.title}</strong>
              <span className="block text-xs text-ink-soft">{t.description}</span>
            </span>
          </label>
        ))}
      </div>
    </ActionForm>
  );
}

export function ReferralList({ referrals }: { referrals: ReferralRow[] }) {
  if (!referrals.length) return <p className="text-sm text-ink-soft">No referrals.</p>;
  return (
    <ul className="space-y-2">
      {referrals.map((r) => (
        <li key={r.id} className="rounded-xl border border-line px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/dashboard/referrals/${r.id}`} className="font-semibold text-teal hover:underline">
              {REFERRAL_TEMPLATES_BY_SLUG.get(r.template)?.title ?? 'Referral'}{r.recipient_organisation || r.recipient_name ? ` → ${r.recipient_organisation ?? r.recipient_name}` : ''}
            </Link>
            <ReferralStatusBadge status={r.status} />
          </div>
          <p className="text-xs text-ink-soft">
            {formatClinicTime(r.created_at)} · {r.author_name} · {URGENCY_LABELS[r.urgency].label}{r.reason ? ` · ${r.reason}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
