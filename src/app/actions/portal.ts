'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/app/actions/auth';
import { getInvoice, recordInvoicePayment } from '@/lib/billing';
import { sql } from '@/lib/db';
import { fileFrom, saveUpload } from '@/lib/files';
import { dateStr, errorMessage, num, str } from '@/lib/form';
import { parseAmount, todayISO } from '@/lib/format';
import { audit, requirePatient } from '@/lib/session';

/** A patient tells us they've paid by transfer/QRIS and uploads the receipt. It stays
 * "awaiting confirmation" until the clinic confirms it or matches it on the bank statement. */
export async function submitPaymentProof(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePatient();
  const invoiceId = num(fd, 'invoice_id');
  const amount = parseAmount(str(fd, 'amount'));
  const method = str(fd, 'method') === 'qris' ? 'qris' : 'bank_transfer';
  const file = fileFrom(fd, 'proof');
  if (!invoiceId) return { error: 'Missing invoice.' };
  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.family_id !== user.familyId || invoice.status === 'draft') return { error: 'Invoice not found.' };
  if (!(amount > 0)) return { error: 'Enter the amount you paid.' };
  const pending = (await sql<{ s: number }>`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ${invoiceId} AND status = 'pending_review'`)[0].s;
  if (amount > invoice.patient_balance - pending) return { error: 'That’s more than the balance still owing (including payments already sent for checking).' };
  if (!file) return { error: 'Please attach your transfer receipt or screenshot.' };
  try {
    const proof = await saveUpload(file, { folder: 'payments', familyId: user.familyId, uploadedBy: user.id });
    await recordInvoicePayment(
      {
        invoiceId,
        payerType: 'patient',
        amount,
        method,
        paidAt: dateStr(fd, 'paid_at') ?? todayISO(),
        reference: str(fd, 'reference'),
        notes: 'Submitted in the patient portal',
        proofFileId: proof.id,
        status: 'pending_review',
        submittedByPatient: true,
      },
      user.id
    );
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await audit(user.id, 'submit_payment', 'invoice', invoiceId);
  revalidatePath(`/portal/invoices/${invoiceId}`);
  revalidatePath('/portal');
  return { ok: 'Thank you! We’ve received your receipt and will confirm the payment shortly.' };
}

export async function updateMyContactDetails(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePatient();
  const id = num(fd, 'id');
  if (!id) return { error: 'Missing patient.' };
  const owns = await sql`SELECT 1 FROM patients WHERE id = ${id} AND family_id = ${user.familyId}`;
  if (!owns.length) return { error: 'Patient not found.' };
  await sql`UPDATE patients SET phone = ${str(fd, 'phone')}, email = ${str(fd, 'email')?.toLowerCase() ?? null}, address = ${str(fd, 'address')},
    emergency_contact_name = ${str(fd, 'emergency_contact_name')}, emergency_contact_phone = ${str(fd, 'emergency_contact_phone')}, updated_at = now()
    WHERE id = ${id}`;
  await audit(user.id, 'patient_update_contact', 'patient', id);
  revalidatePath(`/portal/patients/${id}`);
  return { ok: 'Your details have been updated.' };
}
