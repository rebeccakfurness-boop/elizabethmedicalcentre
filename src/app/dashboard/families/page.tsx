import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { can } from '@/lib/auth';
import { formatIDR } from '@/lib/format';
import { listFamilies } from '@/lib/patients';
import { requirePermission } from '@/lib/session';

export default async function FamiliesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission('viewPatients');
  const { q = '' } = await searchParams;
  const families = await listFamilies(q);
  const finance = can(user.role, 'finance');
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Patients" title="Family accounts" actions={can(user.role, 'managePatients') ? <Link href="/dashboard/patients/new" className="btn-clay">+ New patient &amp; family</Link> : null} />
      <p className="mb-5 max-w-2xl text-sm text-ink-soft">
        Each family account links its members&rsquo; patient cards and holds one shared bill, so a parent can manage and pay for the whole
        family from one portal login.
      </p>
      <form className="mb-5 flex gap-2">
        <input className="input max-w-md" name="q" defaultValue={q} placeholder="Family, member name or billing email" aria-label="Search families" />
        <button className="btn-primary">Search</button>
      </form>
      {families.length === 0 ? (
        <EmptyState>No family accounts found.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Members</th>
                <th>Billing email</th>
                <th>Phone</th>
                {finance ? <th className="text-right">Balance owed</th> : null}
              </tr>
            </thead>
            <tbody>
              {families.map((f) => (
                <tr key={f.id} className="hover:bg-paper">
                  <td>
                    <Link href={`/dashboard/families/${f.id}`} className="font-semibold text-teal hover:underline">{f.account_name}</Link>
                    <span className="ml-2 text-xs text-ink-soft">#{f.id}</span>
                  </td>
                  <td>{f.members}</td>
                  <td>{f.billing_email ?? '—'}</td>
                  <td>{f.phone ?? '—'}</td>
                  {finance ? <td className={`text-right ${f.balance > 0 ? 'font-semibold text-red-700' : 'text-ink-soft'}`}>{formatIDR(f.balance)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
