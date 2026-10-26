import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { Pill } from '@/components/ui/Badges';
import { can } from '@/lib/auth';
import { ageFrom, formatIDR } from '@/lib/format';
import { searchPatients } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePermission('viewPatients');
  const { q = '', status = 'active' } = await searchParams;
  const st = status === 'inactive' || status === 'all' ? status : 'active';
  const patients = await searchPatients(q, st);
  const showMoney = can(user.role, 'finance');

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Patients"
        title="Patient cards"
        actions={can(user.role, 'managePatients') ? <Link href="/dashboard/patients/new" className="btn-clay">+ New patient</Link> : null}
      />
      <form className="mb-5 flex flex-wrap gap-2">
        <input className="input max-w-md" name="q" defaultValue={q} placeholder="Name, MRN, phone, email or family" aria-label="Search patients" />
        <select className="input w-auto" name="status" defaultValue={st} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>

      {patients.length === 0 ? (
        <EmptyState>{q ? 'No patients match that search.' : 'No patients yet.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>MRN</th>
                <th>Age</th>
                <th>Family account</th>
                <th>Insurance</th>
                {showMoney ? <th className="text-right">Family balance</th> : null}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="hover:bg-paper">
                  <td>
                    <Link href={`/dashboard/patients/${p.id}`} className="font-semibold text-teal hover:underline">
                      {p.first_name} {p.last_name}
                    </Link>
                    {p.allergies ? <span className="ml-2"><Pill tone="red">Allergy</Pill></span> : null}
                    {p.status === 'inactive' ? <span className="ml-2"><Pill>Inactive</Pill></span> : null}
                  </td>
                  <td className="font-mono text-xs">{p.mrn}</td>
                  <td>{ageFrom(p.date_of_birth) ?? '—'}</td>
                  <td>
                    <Link href={`/dashboard/families/${p.family_id}`} className="hover:underline">{p.account_name}</Link>
                  </td>
                  <td>{p.insurer_name ?? <span className="text-ink-soft">Self-pay</span>}</td>
                  {showMoney ? (
                    <td className={`text-right ${p.family_balance > 0 ? 'font-semibold text-red-700' : 'text-ink-soft'}`}>{formatIDR(p.family_balance)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
