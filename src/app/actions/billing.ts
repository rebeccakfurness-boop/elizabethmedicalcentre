'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import {
  createClaimForInvoice,
  createInvoice,
  deleteDraftInvoice,
  deletePayment,
  getInvoice,
  issueInvoice,
  recordInvoicePayment,
  setPaymentStatus,
  shiftInsurerShortfallToPatient,
  updateClaim,
  updateInvoice,
  voidInvoice,
  type ClaimStatus,
  type InvoiceInput,
  type PaymentMethod,
} from '@/lib/billing';
import { sql } from '@/lib/db';
import { sendInvoiceEmail } from '@/lib/email';
import { fileFrom, saveUpload } from '@/lib/files';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { parseAmount, todayISO } from '@/lib/format';
import { audit, requirePermission } from '@/lib/session';

const METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'qris', 'insurance', 'other'];
const CLAIM_STATUSES: ClaimStatus[] = ['draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'paid'];

function parseInvoiceForm(fd: FormData): InvoiceInput {
  const familyId = num(fd, 'family_id');
  if (!familyId) throw new Error('Choose a family account to bill.');
  let items: InvoiceInput['items'];
  try {
    const raw = JSON.parse(String(fd.get('items') ?? '[]')) as { patientId: number | null; description: string; quantity: number; unitPrice: number; insuranceCovered: boolean }[];
    items = raw
      .filter((r) => r.description?.trim() || r.unitPrice)
      .map((r) => ({
        patientId: r.patientId ? Number(r.patientId) : null,
        description: String(r.description ?? ''),
        quantity: Number(r.quantity),
        unitPrice: Math.round(Number(r.unitPrice)),
        insuranceCovered: !!r.insuranceCovered,
      }));
  } catch {
    throw new Error('The line items couldn’t be read. Please try again.');
  }
  const issueDate = dateStr(fd, 'issue_date');
  const dueDate = dateStr(fd, 'due_date');
  if (!issueDate || !dueDate) throw new Error('Enter the issue and due dates.');
  return {
    familyId,
    billedToName: str(fd, 'billed_to_name') ?? '',
    issueDate,
    dueDate,
    discount: Math.max(0, parseAmount(str(fd, 'discount') ?? '0') || 0),
    insurerId: num(fd, 'insurer_id'),
    notes: str(fd, 'notes'),
    items,
  };
}

export async function saveInvoice(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  const intent = str(fd, 'intent');
  let invoiceId: number;
  try {
    const input = parseInvoiceForm(fd);
    // Same family check for every patient on the invoice.
    const patientIds = input.items.map((i) => i.patientId).filter((x): x is number => !!x);
    if (patientIds.length) {
      const ok = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM patients WHERE id = ANY(${patientIds}) AND family_id = ${input.familyId}`;
      if (ok[0].n !== new Set(patientIds).size) throw new Error('Every patient on the invoice must belong to the billed family.');
    }
    if (id) {
      await updateInvoice(id, input);
      if (intent === 'issue') await issueInvoice(id);
      invoiceId = id;
      await audit(user.id, 'update', 'invoice', id);
    } else {
      invoiceId = await createInvoice(input, user.id, intent === 'issue');
      await audit(user.id, 'create', 'invoice', invoiceId);
      const encounterId = num(fd, 'encounter_id');
      if (encounterId) {
        // Links the visit to its bill so it isn't invoiced twice.
        await sql`UPDATE encounters e SET invoice_id = ${invoiceId} FROM patients p
          WHERE e.id = ${encounterId} AND e.invoice_id IS NULL AND p.id = e.patient_id AND p.family_id = ${input.familyId}`;
      }
    }
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath('/dashboard/invoices');
  redirect(`/dashboard/invoices/${invoiceId}`);
}

export async function issueInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing invoice.' };
  await issueInvoice(id);
  await audit(user.id, 'issue', 'invoice', id);
  revalidatePath(`/dashboard/invoices/${id}`);
  return { ok: 'Invoice issued. The family can now see it in their portal.' };
}

export async function voidInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing invoice.' };
  try {
    await voidInvoice(id, str(fd, 'reason') ?? '');
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'void', 'invoice', id);
  revalidatePath(`/dashboard/invoices/${id}`);
  return { ok: 'Invoice voided.' };
}

export async function deleteDraftAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing invoice.' };
  try {
    await deleteDraftInvoice(id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'delete_draft', 'invoice', id);
  redirect('/dashboard/invoices');
}

export async function recordPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const invoiceId = num(fd, 'invoice_id');
  const amount = parseAmount(str(fd, 'amount'));
  const method = str(fd, 'method') as PaymentMethod;
  const payerType = str(fd, 'payer_type') === 'insurer' ? 'insurer' : 'patient';
  if (!invoiceId) return { error: 'Missing invoice.' };
  if (!(amount > 0)) return { error: 'Enter the amount received.' };
  if (!METHODS.includes(method)) return { error: 'Choose how it was paid.' };
  try {
    const inv = await getInvoice(invoiceId);
    const file = fileFrom(fd, 'proof');
    const proof = file ? await saveUpload(file, { folder: 'payments', familyId: inv?.family_id, uploadedBy: user.id }) : null;
    await recordInvoicePayment(
      { invoiceId, payerType, amount, method, paidAt: dateStr(fd, 'paid_at') ?? todayISO(), reference: str(fd, 'reference'), notes: str(fd, 'notes'), proofFileId: proof?.id ?? null },
      user.id
    );
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'record_payment', 'invoice', invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: 'Payment recorded.' };
}

export async function reviewPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'payment_id');
  const decision = str(fd, 'decision') === 'confirm' ? 'confirmed' : 'rejected';
  if (!id) return { error: 'Missing payment.' };
  try {
    await setPaymentStatus(id, decision);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, `payment_${decision}`, 'payment', id);
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/invoices');
  return { ok: decision === 'confirmed' ? 'Payment confirmed.' : 'Payment rejected.' };
}

export async function deletePaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'payment_id');
  if (!id) return { error: 'Missing payment.' };
  await deletePayment(id);
  await audit(user.id, 'delete', 'payment', id);
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/invoices');
  return { ok: 'Payment removed.' };
}

export async function sendInvoiceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  const to = str(fd, 'email');
  if (!id || !to) return { error: 'Enter an email address.' };
  try {
    await sendInvoiceEmail(id, to);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await sql`UPDATE invoices SET sent_at = now() WHERE id = ${id}`;
  await audit(user.id, 'email', 'invoice', id, to);
  revalidatePath(`/dashboard/invoices/${id}`);
  return { ok: `Invoice emailed to ${to}.` };
}

// ---------- Insurance ----------

export async function createClaimAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const invoiceId = num(fd, 'invoice_id');
  if (!invoiceId) return { error: 'Missing invoice.' };
  let claimId: number;
  try {
    claimId = await createClaimForInvoice(invoiceId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'create', 'claim', claimId);
  redirect(`/dashboard/insurance/${claimId}`);
}

export async function updateClaimAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  const status = str(fd, 'status') as ClaimStatus;
  if (!id || !CLAIM_STATUSES.includes(status)) return { error: 'Choose a status.' };
  const approvedRaw = str(fd, 'amount_approved');
  const approved = approvedRaw ? parseAmount(approvedRaw) : null;
  if ((status === 'approved' || status === 'partially_approved') && !(approved && approved > 0)) {
    return { error: 'Enter the amount the insurer approved.' };
  }
  await updateClaim(id, {
    status,
    claimReference: str(fd, 'claim_reference'),
    policyNumber: str(fd, 'policy_number'),
    amountApproved: status === 'rejected' ? 0 : approved,
    submittedAt: dateStr(fd, 'submitted_at') ?? (status !== 'draft' ? todayISO() : null),
    decidedAt: dateStr(fd, 'decided_at') ?? (['approved', 'partially_approved', 'rejected'].includes(status) ? todayISO() : null),
    notes: str(fd, 'notes'),
  });
  await audit(user.id, `claim_${status}`, 'claim', id);
  revalidatePath(`/dashboard/insurance/${id}`);
  return { ok: 'Claim updated.' };
}

export async function shiftShortfallAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing claim.' };
  try {
    const shortfall = await shiftInsurerShortfallToPatient(id);
    await audit(user.id, 'shift_shortfall', 'claim', id, String(shortfall));
    revalidatePath(`/dashboard/insurance/${id}`);
    return { ok: `Rp ${shortfall.toLocaleString('id-ID')} moved to the family’s balance.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function saveInsurer(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission('finance');
  const id = num(fd, 'id');
  const name = str(fd, 'name');
  if (!name) return { error: 'Enter the insurer’s name.' };
  const terms = num(fd, 'payment_terms_days') ?? 30;
  const active = str(fd, 'is_active') !== 'false';
  try {
    if (id) {
      await sql`UPDATE insurers SET name = ${name}, contact_name = ${str(fd, 'contact_name')}, contact_email = ${str(fd, 'contact_email')},
        phone = ${str(fd, 'phone')}, billing_address = ${str(fd, 'billing_address')}, payment_terms_days = ${terms}, notes = ${str(fd, 'notes')},
        is_active = ${active} WHERE id = ${id}`;
    } else {
      await sql`INSERT INTO insurers (name, contact_name, contact_email, phone, billing_address, payment_terms_days, notes)
        VALUES (${name}, ${str(fd, 'contact_name')}, ${str(fd, 'contact_email')}, ${str(fd, 'phone')}, ${str(fd, 'billing_address')}, ${terms}, ${str(fd, 'notes')})`;
    }
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, id ? 'update' : 'create', 'insurer', id);
  revalidatePath('/dashboard/insurance');
  return { ok: id ? 'Insurer saved.' : 'Insurer added.' };
}
