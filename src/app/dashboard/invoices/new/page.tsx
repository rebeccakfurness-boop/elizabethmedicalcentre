import Link from 'next/link';
import { saveInvoice } from '@/app/actions/billing';
import { InvoiceForm } from '@/components/billing/InvoiceForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { defaultDueDate, getClinicSettings } from '@/lib/billing';
import { getEncounter, getEncounterPrescriptions, getPrescriptionItems } from '@/lib/clinical';
import { formatDate, todayISO } from '@/lib/format';
import { getFamily, getFamilyMembers, getInsurers, listFamilies } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ family?: string; patient?: string; encounter?: string; q?: string }> }) {
  await requirePermission('finance');
  const { family: familyParam, patient: patientParam, encounter: encounterParam, q = '' } = await searchParams;
  const family = familyParam ? await getFamily(Number(familyParam)) : null;

  if (!family) {
    const families = await listFamilies(q);
    return (
      <div className="max-w-3xl">
        <PageHeader eyebrow="Billing" title="New invoice" back={{ href: '/dashboard/invoices', label: 'Invoices' }} />
        <div className="card">
          <p className="mb-4 text-sm text-ink-soft">Who is this invoice for? Choose the family account. Every invoice belongs to one family so their balance stays in one place.</p>
          <form className="mb-4 flex gap-2">
            <input className="input" name="q" defaultValue={q} placeholder="Search family or patient name" aria-label="Search families" autoFocus />
            <button className="btn-primary">Search</button>
          </form>
          <ul className="divide-y divide-line">
            {families.slice(0, 30).map((f) => (
              <li key={f.id}>
                <Link href={`/dashboard/invoices/new?family=${f.id}`} className="flex justify-between py-3 hover:text-teal">
                  <span className="font-semibold">{f.account_name}</span>
                  <span className="text-sm text-ink-soft">{f.members} member{f.members === 1 ? '' : 's'}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">
            New patient? <Link href="/dashboard/patients/new" className="text-teal underline">Create their patient card</Link> first.
          </p>
        </div>
      </div>
    );
  }

  const [members, insurers, settings] = await Promise.all([getFamilyMembers(family.id), getInsurers(), getClinicSettings()]);
  const holder = members.find((m) => m.is_account_holder) ?? members[0];
  const focus = members.find((m) => m.id === Number(patientParam)) ?? holder;
  const issueDate = todayISO();

  // Invoicing a finished visit: consultation fee plus each issued medicine (prices to fill in).
  const encounter = encounterParam ? await getEncounter(Number(encounterParam)) : null;
  const visit = encounter && encounter.family_id === family.id && encounter.status === 'completed' && !encounter.invoice_id ? encounter : null;
  const visitPatient = visit ? members.find((m) => m.id === visit.patient_id) : null;
  let items = [{ patientId: focus?.id ?? null, description: '', quantity: 1, unitPrice: 0, insuranceCovered: !!focus?.insurer_id }];
  if (visit) {
    const rx = (await getEncounterPrescriptions(visit.id)).filter((r) => r.status === 'issued');
    const meds = await getPrescriptionItems(rx.map((r) => r.id));
    const covered = !!visitPatient?.insurer_id;
    items = [
      { patientId: visit.patient_id, description: `${visit.encounter_type === 'home_visit' ? 'Home / hotel visit' : 'GP consultation'} – ${formatDate(visit.arrived_at)}`, quantity: 1, unitPrice: Number(settings.consultation_fee), insuranceCovered: covered },
      ...meds.map((m) => ({ patientId: visit.patient_id, description: `Medication: ${m.drug_name}${m.quantity ? ` (${m.quantity})` : ''}`, quantity: 1, unitPrice: 0, insuranceCovered: covered })),
    ];
  }

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow={`Family account · ${family.account_name}`} title="New invoice" back={{ href: `/dashboard/families/${family.id}`, label: family.account_name }} />
      {visit ? (
        <p className="mb-4 rounded-xl bg-teal-soft p-3 text-sm">
          Billing the visit on {formatDate(visit.arrived_at)} for {visit.first_name} {visit.last_name}. Medicines from the prescription are listed at Rp 0: add their prices or remove them.
        </p>
      ) : encounterParam ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">That visit is not finished, belongs to another family, or already has an invoice.</p>
      ) : null}
      <div className="card">
        <InvoiceForm
          action={saveInvoice}
          members={members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, insurerId: m.insurer_id }))}
          insurers={insurers}
          taxRate={Number(settings.tax_rate_percent)}
          initial={{
            familyId: family.id,
            billedToName: holder ? `${holder.first_name} ${holder.last_name}` : family.account_name,
            issueDate,
            dueDate: defaultDueDate(issueDate, settings.invoice_due_days),
            discount: 0,
            encounterId: visit?.id ?? null,
            insurerId: (visitPatient ?? focus)?.insurer_id ?? null,
            notes: '',
            items,
          }}
        />
      </div>
    </div>
  );
}
