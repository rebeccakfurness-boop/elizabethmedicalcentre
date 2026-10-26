import { saveClinicSettings, setBudgetPin } from '@/app/actions/finance';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field, TextArea } from '@/components/ui/Field';
import { getClinicSettings } from '@/lib/billing';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { requirePermission } from '@/lib/session';

export default async function SettingsPage() {
  await requirePermission('finance');
  const s = await getClinicSettings();
  const recent = await sql<{ id: number; created_at: string; name: string | null; action: string; entity: string; entity_id: number | null }>`
    SELECT a.id, a.created_at, u.name, a.action, a.entity, a.entity_id FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT 40`;
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Admin" title="Clinic settings" />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="card-title mb-1">Invoice details</h2>
          <p className="mb-4 text-sm text-ink-soft">Shown on every invoice PDF and in the patient portal&rsquo;s payment instructions.</p>
          <ActionForm action={saveClinicSettings} submitLabel="Save settings">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Legal name" name="legal_name" defaultValue={s.legal_name} required className="sm:col-span-2" />
              <Field label="Address" name="address" defaultValue={s.address} required className="sm:col-span-2" />
              <Field label="Email" name="email" type="email" defaultValue={s.email} />
              <Field label="Phone / WhatsApp" name="phone" defaultValue={s.phone} />
              <Field label="Bank" name="bank_name" defaultValue={s.bank_name} placeholder="e.g. BCA" />
              <Field label="Account name" name="bank_account_name" defaultValue={s.bank_account_name} />
              <Field label="Account number" name="bank_account_number" defaultValue={s.bank_account_number} />
              <Field label="SWIFT (for overseas transfers)" name="bank_swift" defaultValue={s.bank_swift} />
              <Field label="Invoice due after (days)" name="invoice_due_days" type="number" defaultValue={s.invoice_due_days} />
              <Field label="Tax rate (%)" name="tax_rate_percent" type="number" step="0.01" defaultValue={Number(s.tax_rate_percent)} hint="Medical services are usually VAT-exempt in Indonesia; check with your accountant." />
            </div>
            <TextArea label="Invoice footer" name="invoice_footer_note" defaultValue={s.invoice_footer_note} rows={2} />
            <fieldset className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <legend className="card-title mb-2">Clinic</legend>
              <Field label="Standard consultation fee (Rp)" name="consultation_fee" type="number" defaultValue={Number(s.consultation_fee)} hint="Pre-filled when invoicing a completed visit." />
              <label className="flex items-start gap-2 self-center text-sm">
                <input type="checkbox" name="dictation_enabled" defaultChecked={s.dictation_enabled} className="mt-0.5 h-4 w-4 accent-teal" />
                <span>Allow dictated notes. <span className="text-ink-soft">Uses the browser&rsquo;s speech recognition; in Chrome the audio is processed by Google.</span></span>
              </label>
            </fieldset>
          </ActionForm>
        </section>
        <section className="card h-fit" id="pin">
          <h2 className="card-title mb-1">Budget PIN</h2>
          <p className="mb-4 text-sm text-ink-soft">Protects the budget tracker, bills and bank statements. 4–8 digits.</p>
          <ActionForm action={setBudgetPin} submitLabel={s.budget_pin_hash ? 'Change PIN' : 'Set PIN'} resetOnSuccess>
            {s.budget_pin_hash ? <Field label="Current PIN" name="current_pin" type="password" required /> : null}
            <Field label="New PIN" name="pin" type="password" required />
            <Field label="Confirm new PIN" name="confirm" type="password" required />
          </ActionForm>
        </section>
      </div>
      <section className="card mt-6">
        <h2 className="card-title mb-3">Recent activity</h2>
        <p className="mb-3 text-sm text-ink-soft">Every sign-in, patient-card view and change is logged.</p>
        <div className="max-h-96 overflow-y-auto">
          <table className="table">
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs text-ink-soft">{formatDate(r.created_at)} {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })}</td>
                  <td>{r.name ?? 'System'}</td>
                  <td className="text-xs">{r.action.replace(/_/g, ' ')} · {r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
