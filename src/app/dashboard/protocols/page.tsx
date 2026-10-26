import Link from 'next/link';
import { ApproveForm } from '@/components/clinical/ApproveForm';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Pill } from '@/components/ui/Badges';
import { canPrescribe } from '@/lib/auth';
import { approvalKey, getApprovals } from '@/lib/clinical';
import { requireClinical } from '@/lib/session';
import { PROTOCOLS } from '@/clinical/protocols';
import { DISCRIMINATORS, TRIAGE_INFO, TRIAGE_VERSION } from '@/clinical/triage';

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireClinical();
  const { q = '' } = await searchParams;
  const approvals = await getApprovals();
  const term = q.toLowerCase();
  const list = PROTOCOLS.filter((p) => !term || p.title.toLowerCase().includes(term) || p.keywords.some((k) => k.includes(term)));
  const groups = Array.from(new Set(list.map((p) => p.group)));
  const approvedCount = PROTOCOLS.filter((p) => approvals.has(approvalKey('protocol', p.slug, p.version))).length;
  const triageApproval = approvals.get(approvalKey('triage', 'sats', TRIAGE_VERSION));

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Clinical" title="Protocols" />
      <p className="mb-4 max-w-2xl text-sm text-ink-soft">
        Step-by-step guidance for the presentations we see most in Kuta, Lombok. {approvedCount} of {PROTOCOLS.length} approved by the medical director.
        Unapproved protocols show a warning when used.
      </p>
      <form className="mb-6 flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Search, e.g. jellyfish, dengue, bite" aria-label="Search protocols" />
        <button className="btn-primary">Search</button>
      </form>

      <section className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">Triage rules (SATS-based) · version {TRIAGE_VERSION}</h2>
          {triageApproval ? <Pill tone="teal">Approved · {triageApproval.approvedBy}</Pill> : <Pill tone="amber">Not approved</Pill>}
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Adults (12 and over): TEWS from mobility, breathing rate, heart rate, systolic BP, temperature, AVPU and trauma. 0–2 {TRIAGE_INFO.green.label}, 3–4 {TRIAGE_INFO.yellow.label}, 5–6 {TRIAGE_INFO.orange.label}, 7+ {TRIAGE_INFO.red.label}.
          Children: age-specific normal ranges. {DISCRIMINATORS.length} clinical discriminators (including Lombok-specific ones) can raise the category. SpO₂ under 92% is very urgent; glucose under 3 mmol/L is an emergency.
          Targets: red immediately, orange 10 minutes, yellow 60 minutes, green 4 hours.
        </p>
        {!triageApproval && canPrescribe(user.clinicalRole) ? <div className="mt-3"><ApproveForm kind="triage" slug="sats" version={TRIAGE_VERSION} /></div> : null}
      </section>

      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h2 className="card-title mb-2">{g}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.filter((p) => p.group === g).map((p) => {
              const a = approvals.get(approvalKey('protocol', p.slug, p.version));
              return (
                <li key={p.slug}>
                  <Link href={`/dashboard/protocols/${p.slug}`} className="card flex items-center justify-between gap-3 transition hover:border-teal">
                    <span className="font-semibold text-pulse">{p.title}</span>
                    {a ? <Pill tone="teal">Approved</Pill> : <Pill tone="amber">Draft</Pill>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
