import { createPatient } from '@/app/actions/patients';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PatientFields } from '@/components/patients/PatientFields';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field } from '@/components/ui/Field';
import { getFamily, getInsurers } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function NewPatientPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  await requirePermission('managePatients');
  const { family } = await searchParams;
  const fam = family ? await getFamily(Number(family)) : null;
  const insurers = await getInsurers();

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Patients"
        title={fam ? `Add to ${fam.account_name}` : 'New patient'}
        back={fam ? { href: `/dashboard/families/${fam.id}`, label: fam.account_name } : { href: '/dashboard/patients', label: 'Patients' }}
      />
      <div className="card">
        <ActionForm action={createPatient} submitLabel="Create patient card" submitClassName="btn-clay" className="space-y-6">
          {fam ? (
            <input type="hidden" name="family_id" value={fam.id} />
          ) : (
            <div className="rounded-xl bg-paper p-4">
              <p className="mb-3 text-sm text-ink-soft">
                A new family account is created for this patient. To add someone to an existing family (a child, a spouse), open that family
                account and choose <strong>Add family member</strong> so they share one bill.
              </p>
              <Field label="Family account name" name="account_name" placeholder="Defaults to “[Last name] family”" className="max-w-sm" />
            </div>
          )}
          <PatientFields insurers={insurers} includeMedical />
        </ActionForm>
      </div>
    </div>
  );
}
