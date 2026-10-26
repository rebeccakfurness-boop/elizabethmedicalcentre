import Link from 'next/link';
import { ApproveForm } from '@/components/clinical/ApproveForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Pill } from '@/components/ui/Badges';
import { canPrescribe } from '@/lib/auth';
import { approvalKey, getApprovals } from '@/lib/clinical';
import { requireClinical } from '@/lib/session';
import { DRUGS } from '@/clinical/drugs';
import { LEAFLETS } from '@/clinical/leaflets';

export default async function FormularyPage() {
  const user = await requireClinical();
  const approvals = await getApprovals();
  const doctor = canPrescribe(user.clinicalRole);
  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Clinical" title="Formulary & patient leaflets" />
      <p className="mb-6 max-w-3xl text-sm text-ink-soft">
        Every prescription prints with an information sheet for each medicine and any patient leaflets the doctor attaches. Each item needs approval by a doctor before it is relied on.
      </p>
      <section className="mb-8">
        <h2 className="card-title mb-3">Medicines ({DRUGS.length})</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table">
            <thead><tr><th>Medicine</th><th>Adult dose</th><th>Child dose</th><th>Sheet</th><th>Status</th></tr></thead>
            <tbody>
              {DRUGS.map((d) => {
                const a = approvals.get(approvalKey('drug', d.code, d.version));
                return (
                  <tr key={d.code} className="align-top">
                    <td><strong>{d.name}</strong><span className="block text-xs text-ink-soft">{d.form}{d.clinicOnly ? ' · given in clinic' : ''}</span>{d.cautions.map((c) => <span key={c} className="block text-xs text-amber-800">⚠ {c}</span>)}</td>
                    <td className="text-xs">{d.adultDose}</td>
                    <td className="text-xs">{d.childDose ?? '—'}</td>
                    <td><Link href={`/print/drug/${d.code}`} target="_blank" className="text-xs text-teal underline">View / print</Link></td>
                    <td className="min-w-56">
                      {a ? <Pill tone="teal">Approved · {a.approvedBy}</Pill> : doctor ? (
                        <details><summary className="cursor-pointer text-xs text-amber-800">Draft: review</summary><div className="mt-2"><ApproveForm kind="drug" slug={d.code} version={d.version} /></div></details>
                      ) : <Pill tone="amber">Draft</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="card-title mb-3">Patient information leaflets ({LEAFLETS.length})</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {LEAFLETS.map((l) => {
            const a = approvals.get(approvalKey('leaflet', l.slug, l.version));
            return (
              <li key={l.slug} className="card">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/print/leaflet/${l.slug}`} target="_blank" className="font-semibold text-teal hover:underline">{l.title}</Link>
                  {a ? <Pill tone="teal">Approved</Pill> : <Pill tone="amber">Draft</Pill>}
                </div>
                {!a && doctor ? <details className="mt-2"><summary className="cursor-pointer text-xs text-amber-800">Review and approve</summary><div className="mt-2"><ApproveForm kind="leaflet" slug={l.slug} version={l.version} /></div></details> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
