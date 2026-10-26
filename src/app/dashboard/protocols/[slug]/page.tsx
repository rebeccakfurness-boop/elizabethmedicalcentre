import { notFound } from 'next/navigation';
import { ApproveForm } from '@/components/clinical/ApproveForm';
import { ApprovalBanner } from '@/components/clinical/Badges';
import { ProtocolView } from '@/components/clinical/ProtocolView';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { canPrescribe } from '@/lib/auth';
import { approvalKey, getApprovals } from '@/lib/clinical';
import { requireClinical } from '@/lib/session';
import { PROTOCOLS_BY_SLUG } from '@/clinical/protocols';

export default async function ProtocolPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireClinical();
  const protocol = PROTOCOLS_BY_SLUG.get((await params).slug);
  if (!protocol) notFound();
  const approval = (await getApprovals()).get(approvalKey('protocol', protocol.slug, protocol.version));
  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow={`${protocol.group} · version ${protocol.version}`} title={protocol.title} back={{ href: '/dashboard/protocols', label: 'Protocols' }} />
      <div className="card space-y-4">
        <ApprovalBanner approved={approval} />
        <ProtocolView protocol={protocol} />
        <p className="text-xs text-ink-soft">Matched to complaints mentioning: {protocol.keywords.join(', ')}</p>
      </div>
      {!approval && canPrescribe(user.clinicalRole) ? (
        <div className="card mt-6">
          <h2 className="card-title mb-3">Medical director sign-off</h2>
          <ApproveForm kind="protocol" slug={protocol.slug} version={protocol.version} />
        </div>
      ) : null}
    </div>
  );
}
