import { saveSupplier } from '@/app/actions/inventory';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { getSuppliers, type Supplier } from '@/lib/operations';
import { requirePermission } from '@/lib/session';

function SupplierFields({ s }: { s?: Supplier }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <Field label="Supplier" name="name" defaultValue={s?.name} required />
      <Field label="Contact person" name="contact_name" defaultValue={s?.contact_name} />
      <Field label="Phone / WhatsApp" name="phone" defaultValue={s?.phone} />
      <Field label="Email" name="email" type="email" defaultValue={s?.email} />
      <TextArea label="Notes (delivery days, minimum order, payment terms)" name="notes" defaultValue={s?.notes} rows={2} className="sm:col-span-2" />
      {s ? <Select label="Status" name="is_active" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Hidden' }]} defaultValue={String(s.is_active)} /> : null}
    </div>
  );
}

export default async function SuppliersPage() {
  await requirePermission('manageOperations');
  const suppliers = await getSuppliers(true);
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Inventory" title="Suppliers" back={{ href: '/dashboard/operations/inventory', label: 'Inventory' }} />
      <section className="card mb-6">
        <h2 className="card-title mb-3">Add a supplier</h2>
        <ActionForm action={saveSupplier} submitLabel="Add supplier" resetOnSuccess><SupplierFields /></ActionForm>
      </section>
      <ul className="space-y-3">
        {suppliers.map((s) => (
          <li key={s.id} className={`card ${s.is_active ? '' : 'opacity-60'}`}>
            <details>
              <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                <strong className="text-pulse">{s.name}</strong>
                <span className="text-sm text-ink-soft">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ')}</span>
              </summary>
              <div className="mt-4"><ActionForm action={saveSupplier} submitLabel="Save"><SupplierFields s={s} /></ActionForm></div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
