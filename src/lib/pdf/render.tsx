import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { getClinicSettings, getInvoice, getInvoiceItems } from '@/lib/billing';
import { sql } from '@/lib/db';
import { getNote } from '@/lib/clinical';
import { ageFrom } from '@/lib/format';
import { getLabOrder, getLabResults } from '@/lib/labs';
import { getPatient } from '@/lib/patients';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';
import { ReferralDocument } from '@/lib/pdf/ReferralDocument';
import { pdfText } from '@/lib/pdf/text';
import { getReferral } from '@/lib/referrals';
import { REFERRAL_TEMPLATES_BY_SLUG } from '@/clinical/referrals';

export async function renderInvoicePdf(invoiceId: number): Promise<{ buffer: Buffer; fileName: string; familyId: number; status: string }> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found.');
  const [items, clinic, fam] = await Promise.all([
    getInvoiceItems(invoiceId),
    getClinicSettings(),
    sql<{ billing_email: string | null }>`SELECT billing_email FROM families WHERE id = ${invoice.family_id}`,
  ]);
  const buffer = await renderToBuffer(<InvoiceDocument invoice={invoice} items={items} clinic={clinic} familyEmail={fam[0]?.billing_email ?? null} />);
  return { buffer, fileName: `${invoice.invoice_number}.pdf`, familyId: invoice.family_id, status: invoice.status };
}

function cleanStrings<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string') out[k] = pdfText(v);
  return out as T;
}

export async function renderReferralPdf(referralId: number): Promise<{ buffer: Buffer; fileName: string }> {
  const referral = await getReferral(referralId);
  if (!referral) throw new Error('Referral not found.');
  const template = REFERRAL_TEMPLATES_BY_SLUG.get(referral.template);
  if (!template) throw new Error('Unknown referral template.');
  const [patient, clinic] = await Promise.all([getPatient(referral.patient_id), getClinicSettings()]);
  if (!patient) throw new Error('Patient not found.');
  // Only attach notes and results that belong to this patient (and signed notes only).
  const notes = (await Promise.all(referral.attach_note_ids.map(getNote))).filter((n) => !!n && n.patient_id === patient.id && !!n.signed_at);
  const labOrders = (await Promise.all(referral.attach_lab_order_ids.map(getLabOrder))).filter((o) => !!o && o.patient_id === patient.id);
  const labResults = await getLabResults(labOrders.map((o) => o!.id));
  const buffer = await renderToBuffer(
    <ReferralDocument
      referral={cleanStrings(referral)}
      template={template}
      clinic={cleanStrings(clinic)}
      patient={cleanStrings(patient)}
      age={ageFrom(patient.date_of_birth)}
      notes={notes.map((n) => cleanStrings(n!))}
      labOrders={labOrders.map((o) => cleanStrings(o!))}
      labResults={labResults.map(cleanStrings)}
    />
  );
  const safe = `${patient.last_name}-${patient.first_name}`.replace(/[^\w-]+/g, '');
  return { buffer, fileName: `Referral-REF${referral.id}-${safe}.pdf` };
}
