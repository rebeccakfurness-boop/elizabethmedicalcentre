import { StaffNewAppointment } from '@/components/booking/StaffNewAppointment';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { getAppointmentTypes } from '@/lib/appointments';
import { addDays, clinicParts } from '@/lib/booking-shared';
import { searchPatients } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ q?: string; patient?: string }> }) {
  await requirePermission('viewPatients');
  const { q = '', patient } = await searchParams;
  const types = await getAppointmentTypes(false);
  const found = q || patient ? await searchPatients(q) : [];
  const patients = (patient ? found.filter((p) => String(p.id) === patient) : found).slice(0, 30);
  const today = clinicParts(new Date()).date;
  const dates = Array.from({ length: 61 }, (_, i) => addDays(today, i));
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Appointments" title="New appointment" back={{ href: '/dashboard/appointments', label: 'Appointments' }} />
      <form className="mb-6 flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Find the patient: name, MRN, phone or email" aria-label="Find patient" />
        <button className="btn-primary">Search</button>
      </form>
      <section className="card">
        <StaffNewAppointment
          types={types.filter((t) => t.is_active).map((t) => ({ id: t.id, name: t.name, kind: t.kind }))}
          dates={dates}
          patients={patients.map((p) => ({ id: p.id, label: `${p.first_name} ${p.last_name} (${p.mrn})`, email: p.email, phone: p.phone }))}
        />
      </section>
    </div>
  );
}
