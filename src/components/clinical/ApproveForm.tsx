import { approveContent } from '@/app/actions/clinical';
import { ActionForm } from '@/components/ui/ActionForm';

export function ApproveForm({ kind, slug, version }: { kind: 'protocol' | 'drug' | 'leaflet' | 'triage'; slug: string; version: number }) {
  return (
    <ActionForm action={approveContent} submitLabel={`Approve version ${version}`} submitClassName="btn-primary btn-sm">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slug" value={slug} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-teal" />
        I have reviewed this content against current guidance and local availability, and approve it for clinical use at this clinic.
      </label>
      <input className="input text-sm" name="comments" placeholder="Comments (optional)" aria-label="Approval comments" />
    </ActionForm>
  );
}
