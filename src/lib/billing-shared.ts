// Pure types and maths shared by server code and client components (the invoice form preview).

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'qris' | 'insurance' | 'other';
export type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'partially_approved' | 'rejected' | 'paid';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  qris: 'QRIS',
  insurance: 'Insurance',
  other: 'Other',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  partially_approved: 'Partly approved',
  rejected: 'Rejected',
  paid: 'Paid',
};

export interface InvoiceItemInput {
  patientId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  insuranceCovered: boolean;
}

export interface InvoiceInput {
  familyId: number;
  billedToName: string;
  issueDate: string;
  dueDate: string;
  discount: number;
  insurerId: number | null;
  notes: string | null;
  items: InvoiceItemInput[];
}

export interface InvoiceTotals {
  lines: (InvoiceItemInput & { amount: number })[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  insurerPortion: number;
  patientPortion: number;
}

/** The single place invoice maths happens; create, edit and the form preview all use it.
 * Discount and tax are spread across insured and uninsured lines in proportion, so the
 * insurer's share is (covered lines / all lines) of the final total. */
export function computeInvoiceTotals(items: InvoiceItemInput[], discountInput: number, taxRatePercent: number, hasInsurer: boolean): InvoiceTotals {
  const lines = items.map((it) => ({ ...it, amount: Math.round(it.quantity * it.unitPrice) }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const discount = Math.min(Math.max(0, Math.round(discountInput || 0)), subtotal);
  const tax = Math.round(((subtotal - discount) * (taxRatePercent || 0)) / 100);
  const total = subtotal - discount + tax;
  const covered = hasInsurer ? lines.filter((l) => l.insuranceCovered).reduce((s, l) => s + l.amount, 0) : 0;
  const insurerPortion = subtotal > 0 ? Math.round((total * covered) / subtotal) : 0;
  return { lines, subtotal, discount, tax, total, insurerPortion, patientPortion: total - insurerPortion };
}

