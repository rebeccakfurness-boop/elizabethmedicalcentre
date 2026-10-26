import 'server-only';
import { getClinicSettings, getInvoice } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { renderInvoicePdf, renderReferralPdf } from '@/lib/pdf/render';
import { getReferral } from '@/lib/referrals';
import { URGENCY_LABELS } from '@/clinical/referrals';

// Transactional email via Brevo's REST API (same provider as the Selong Bay system).
// Needs BREVO_API_KEY and EMAIL_FROM (a sender address verified in Brevo).

async function send(input: { to: string; subject: string; html: string; attachment?: { name: string; content: string }; replyTo?: { email: string; name: string } }) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Email isn’t set up yet (BREVO_API_KEY and EMAIL_FROM). Download the PDF and send it yourself for now.');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'The Doctors – Elizabeth Medical Centre' },
      to: [{ email: input.to }],
      bcc: [{ email: from }],
      subject: input.subject,
      htmlContent: input.html,
      attachment: input.attachment ? [input.attachment] : undefined,
      replyTo: input.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`The email couldn’t be sent (${res.status}). ${body.slice(0, 200)}`);
  }
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendInvoiceEmail(invoiceId: number, to: string): Promise<void> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('That email address doesn’t look right.');
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.status === 'draft') throw new Error('Issue the invoice before emailing it.');
  const clinic = await getClinicSettings();
  const pdf = await renderInvoicePdf(invoiceId);
  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/login` : null;
  await send({
    to,
    subject: `Invoice ${invoice.invoice_number} from The Doctors – Elizabeth Medical Centre`,
    html: `<p>Dear ${escape(invoice.billed_to_name)},</p>
      <p>Please find attached invoice <strong>${invoice.invoice_number}</strong> dated ${formatDate(invoice.issue_date)}.</p>
      <p>Balance due: <strong>${formatIDR(invoice.patient_balance)}</strong> by ${formatDate(invoice.due_date)}.</p>
      ${clinic.bank_account_number ? `<p>Bank transfer: ${escape(clinic.bank_name ?? '')} · ${escape(clinic.bank_account_name ?? '')} · ${escape(clinic.bank_account_number)} (reference ${invoice.invoice_number}).</p>` : ''}
      ${portalUrl ? `<p>You can also view and pay your invoices in the <a href="${portalUrl}">patient portal</a>.</p>` : ''}
      <p>Warm regards,<br>The Doctors – Elizabeth Medical Centre</p>`,
    attachment: { name: pdf.fileName, content: pdf.buffer.toString('base64') },
  });
}

/**
 * Sends a signed referral letter as a PDF. The email body names nobody: patient details are only in
 * the attachment. Replies go straight to the referring clinician.
 */
export async function sendReferralEmail(referralId: number, to: string, opts: { toPatient?: boolean } = {}): Promise<void> {
  if (!isEmail(to)) throw new Error('That email address doesn’t look right.');
  const r = await getReferral(referralId);
  if (!r) throw new Error('Referral not found.');
  if (r.status === 'draft' || r.status === 'cancelled') throw new Error('Sign the referral before sending it.');
  const pdf = await renderReferralPdf(referralId);
  const initials = `${r.first_name[0] ?? ''}${r.last_name[0] ?? ''}`.toUpperCase();
  const urgency = URGENCY_LABELS[r.urgency].label;
  await send({
    to,
    subject: opts.toPatient
      ? 'Your referral letter from The Doctors – Elizabeth Medical Centre'
      : `${urgency} referral REF-${r.id} (patient ${initials}) from The Doctors – Elizabeth Medical Centre`,
    html: opts.toPatient
      ? `<p>Dear ${escape(r.first_name)},</p>
        <p>Attached is a copy of the referral letter ${escape(r.author_name)} wrote for you to ${escape(r.recipient_organisation ?? r.recipient_name)}.
        Please take it (on your phone or printed) to your appointment.</p>
        <p>If you feel worse before then, contact the clinic or call 119 in an emergency.</p>
        <p>Warm regards,<br>The Doctors – Elizabeth Medical Centre</p>`
      : `<p>Dear ${escape(r.recipient_name)},</p>
        <p>Please find attached a <strong>${urgency.toLowerCase()}</strong> referral (reference REF-${r.id}) from ${escape(r.author_name)}
        at The Doctors – Elizabeth Medical Centre, Kuta, Lombok, for a patient with initials ${escape(initials)}.</p>
        <p>The attachment contains confidential health information. Replying to this email reaches ${escape(r.author_name)} directly.</p>
        <p>If you have received this in error, please delete it and let us know.</p>
        <p>With thanks,<br>${escape(r.author_name)}<br>The Doctors – Elizabeth Medical Centre</p>`,
    attachment: { name: pdf.fileName, content: pdf.buffer.toString('base64') },
    replyTo: { email: r.author_email, name: r.author_name },
  });
}
