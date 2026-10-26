import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { getClinicSettings, getInvoice, getInvoiceItems } from '@/lib/billing';
import { sql } from '@/lib/db';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';

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
