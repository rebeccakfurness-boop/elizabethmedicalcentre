import { notFound, redirect } from 'next/navigation';
import { saveInvoice } from '@/app/actions/billing';
import { InvoiceForm } from '@/components/billing/InvoiceForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { getClinicSettings, getInvoice, getInvoiceItems } from '@/lib/billing';
import { getFamilyMembers, getInsurers } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('finance');
  const invoice = await getInvoice(Number((await params).id));
  if (!invoice) notFound();
  if (invoice.status === 'void') redirect(`/dashboard/invoices/${invoice.id}`);
  const [items, members, insurers, settings] = await Promise.all([getInvoiceItems(invoice.id), getFamilyMembers(invoice.family_id), getInsurers(false), getClinicSettings()]);
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow={invoice.account_name} title={`Edit ${invoice.invoice_number}`} back={{ href: `/dashboard/invoices/${invoice.id}`, label: invoice.invoice_number }} />
      {invoice.status !== 'draft' ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This invoice has already been issued. Changes show immediately in the family&rsquo;s portal; if you&rsquo;ve emailed it, send the updated copy too.
        </p>
      ) : null}
      <div className="card">
        <InvoiceForm
          action={saveInvoice}
          members={members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, insurerId: m.insurer_id }))}
          insurers={insurers}
          taxRate={Number(settings.tax_rate_percent)}
          initial={{
            id: invoice.id,
            isDraft: invoice.status === 'draft',
            familyId: invoice.family_id,
            billedToName: invoice.billed_to_name,
            issueDate: invoice.issue_date,
            dueDate: invoice.due_date,
            discount: invoice.discount,
            insurerId: invoice.insurer_id,
            notes: invoice.notes ?? '',
            items: items.map((i) => ({ patientId: i.patient_id, description: i.description, quantity: Number(i.quantity), unitPrice: i.unit_price, insuranceCovered: i.insurance_covered })),
          }}
        />
      </div>
    </div>
  );
}
