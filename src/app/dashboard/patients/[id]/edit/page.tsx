import { notFound } from 'next/navigation';
import { updatePatientDetails } from '@/app/actions/patients';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PatientFields } from '@/components/patients/PatientFields';
import { ActionForm } from '@/components/ui/ActionForm';
import { getInsurers, getPatient } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('managePatients');
  const patient = await getPatient(Number((await params).id));
  if (!patient) notFound();
  const insurers = await getInsurers(false);
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Edit patient" title={`${patient.first_name} ${patient.last_name}`} back={{ href: `/dashboard/patients/${patient.id}`, label: 'Patient card' }} />
      <div className="card">
        <ActionForm action={updatePatientDetails} submitLabel="Save changes" className="space-y-6">
          <input type="hidden" name="id" value={patient.id} />
          <PatientFields patient={patient} insurers={insurers} />
        </ActionForm>
      </div>
    </div>
  );
}
