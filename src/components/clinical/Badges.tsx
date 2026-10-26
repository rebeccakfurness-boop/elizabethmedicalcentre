import { TRIAGE_INFO, type TriageCategory } from '@/clinical/triage';

export function TriageBadge({ category, large = false }: { category: TriageCategory | null; large?: boolean }) {
  if (!category) return <span className="pill bg-stone-100 text-stone-600">Not triaged</span>;
  const info = TRIAGE_INFO[category];
  return <span className={`pill ${info.className} ${large ? 'px-3 py-1 text-xs' : ''}`}>{category.toUpperCase()} · {info.label}</span>;
}

export function ApprovalBanner({ approved }: { approved: { approvedBy: string; approvedAt: string } | null | undefined }) {
  if (approved) {
    return <p className="rounded-xl bg-teal-soft px-3 py-2 text-xs text-teal-deep">✓ Approved for clinical use by {approved.approvedBy} on {new Date(approved.approvedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Makassar' })}</p>;
  }
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      ⚠ Draft: not yet approved by the medical director. Check doses and advice against current guidance before relying on it.
    </p>
  );
}

export function VisibilityBadge({ visibility }: { visibility: 'clinical' | 'staff' | 'patient' }) {
  const map = {
    clinical: { text: '🔒 Clinical only', cls: 'bg-pulse/10 text-pulse' },
    staff: { text: '👥 All staff', cls: 'bg-sky-100 text-sky-900' },
    patient: { text: '🏠 Shared with patient', cls: 'bg-teal-soft text-teal-deep' },
  }[visibility];
  return <span className={`pill ${map.cls}`}>{map.text}</span>;
}
