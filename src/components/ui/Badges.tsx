import type { InvoiceStatus, ClaimStatus } from '@/lib/billing-shared';
import { CLAIM_STATUS_LABELS } from '@/lib/billing-shared';

const INVOICE_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-stone-100 text-stone-700',
  issued: 'bg-amber-100 text-amber-800',
  partially_paid: 'bg-sky-100 text-sky-800',
  paid: 'bg-teal-soft text-teal-deep',
  void: 'bg-stone-200 text-stone-500 line-through',
};
const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Outstanding',
  partially_paid: 'Part paid',
  paid: 'Paid',
  void: 'Void',
};

export function InvoiceStatusBadge({ status, daysOverdue = 0 }: { status: InvoiceStatus; daysOverdue?: number }) {
  if (daysOverdue > 0 && (status === 'issued' || status === 'partially_paid')) {
    return <span className="pill bg-red-100 text-red-800">{daysOverdue}d overdue</span>;
  }
  return <span className={`pill ${INVOICE_STYLES[status]}`}>{INVOICE_LABELS[status]}</span>;
}

const CLAIM_STYLES: Record<ClaimStatus, string> = {
  draft: 'bg-stone-100 text-stone-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  partially_approved: 'bg-orange-100 text-orange-800',
  rejected: 'bg-red-100 text-red-800',
  paid: 'bg-teal-soft text-teal-deep',
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={`pill ${CLAIM_STYLES[status]}`}>{CLAIM_STATUS_LABELS[status]}</span>;
}

export function Pill({ children, tone = 'stone' }: { children: React.ReactNode; tone?: 'stone' | 'red' | 'teal' | 'amber' | 'clay' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    red: 'bg-red-100 text-red-800',
    teal: 'bg-teal-soft text-teal-deep',
    amber: 'bg-amber-100 text-amber-800',
    clay: 'bg-cream text-pulse',
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}
