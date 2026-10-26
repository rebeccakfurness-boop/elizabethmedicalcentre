import 'server-only';
import { getClinicSettings, getInvoice } from '@/lib/billing';
import { formatDate, formatIDR } from '@/lib/format';
import { renderInvoicePdf } from '@/lib/pdf/render';

// Transactional email via Brevo's REST API (same provider as the Selong Bay system).
// Needs BREVO_API_KEY and EMAIL_FROM (a sender address verified in Brevo).

async function send(input: { to: string; subject: string; html: string; attachment?: { name: string; content: string } }) {
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
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`The email couldn’t be sent (${res.status}). ${body.slice(0, 200)}`);
  }
}

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
