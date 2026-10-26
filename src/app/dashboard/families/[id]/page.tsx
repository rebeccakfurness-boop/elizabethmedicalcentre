import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPortalLogin, resetPortalPassword, setAccountHolder, setLoginActive, updateFamily } from '@/app/actions/patients';
import { PageHeader, StatTile } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { ClaimStatusBadge, InvoiceStatusBadge, Pill } from '@/components/ui/Badges';
import { Field, TextArea } from '@/components/ui/Field';
import { can } from '@/lib/auth';
import { listClaims, listInvoices, listPayments, PAYMENT_METHOD_LABELS } from '@/lib/billing';
import { ageFrom, formatDate, formatIDR } from '@/lib/format';
import { getFamily, getFamilyLogins, getFamilyMembers } from '@/lib/patients';
import { audit, requirePermission } from '@/lib/session';

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('viewPatients');
  const family = await getFamily(Number((await params).id));
  if (!family) notFound();
  await audit(user.id, 'view', 'family', family.id);
  const finance = can(user.role, 'finance');
  const manage = can(user.role, 'managePatients');
  const [members, logins, invoices, payments, claims] = await Promise.all([
    getFamilyMembers(family.id),
    manage ? getFamilyLogins(family.id) : Promise.resolve([]),
    finance ? listInvoices({ familyId: family.id }) : Promise.resolve([]),
    finance ? listPayments({ familyId: family.id, limit: 20 }) : Promise.resolve([]),
    finance ? listClaims({ familyId: family.id }) : Promise.resolve([]),
  ]);
  const insurerOwes = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid').reduce((s, i) => s + i.insurer_balance, 0);
  const holder = members.find((m) => m.is_account_holder);

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow={`Family account #${family.id}`}
        title={family.account_name}
        back={{ href: '/dashboard/families', label: 'Family accounts' }}
        actions={
          <>
            {manage ? <Link href={`/dashboard/patients/new?family=${family.id}`} className="btn-ghost">+ Add family member</Link> : null}
            {finance ? <Link href={`/dashboard/invoices/new?family=${family.id}`} className="btn-clay">+ New invoice</Link> : null}
          </>
        }
      />

      {finance ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="Family owes" value={formatIDR(family.balance)} tone={family.balance > 0 ? 'alert' : 'good'} />
          <StatTile label="Insurers owe" value={formatIDR(insurerOwes)} />
          <StatTile label="Invoices" value={invoices.length} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="members">
          <h2 id="members" className="card-title mb-3">Members &amp; patient cards</h2>
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/dashboard/patients/${m.id}`} className="font-semibold text-teal hover:underline">{m.first_name} {m.last_name}</Link>
                  <p className="text-xs text-ink-soft">
                    {m.mrn} · {ageFrom(m.date_of_birth) != null ? `${ageFrom(m.date_of_birth)} years` : 'DOB not recorded'}
                    {m.relationship ? ` · ${m.relationship}` : ''} · {m.insurer_name ?? 'Self-pay'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.allergies ? <Pill tone="red">Allergy</Pill> : null}
                  {m.is_account_holder ? (
                    <Pill tone="clay">Account holder</Pill>
                  ) : manage ? (
                    <ActionForm action={setAccountHolder} submitLabel="Make account holder" submitClassName="btn-ghost btn-sm" inline>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="family_id" value={family.id} />
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {manage ? (
          <section className="card" aria-labelledby="portal">
            <h2 id="portal" className="card-title mb-3">Patient portal logins</h2>
            <p className="mb-4 text-sm text-ink-soft">A login sees every member of this family, their invoices and claims, and can pay online.</p>
            {logins.length ? (
              <ul className="mb-5 divide-y divide-line">
                {logins.map((l) => (
                  <li key={l.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{l.name} {l.is_active ? null : <Pill>Disabled</Pill>}</p>
                        <p className="text-xs text-ink-soft">
                          {l.email} · {l.last_login_at ? `last signed in ${formatDate(l.last_login_at)}` : l.must_change_password ? 'not signed in yet' : 'never signed in'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={resetPortalPassword} submitLabel="Reset password" submitClassName="btn-ghost btn-sm" inline confirm="Issue a new temporary password for this login?">
                          <input type="hidden" name="user_id" value={l.id} />
                        </ActionForm>
                        <ActionForm action={setLoginActive} submitLabel={l.is_active ? 'Disable' : 'Enable'} submitClassName="btn-ghost btn-sm" inline>
                          <input type="hidden" name="user_id" value={l.id} />
                          <input type="hidden" name="active" value={l.is_active ? 'false' : 'true'} />
                        </ActionForm>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={createPortalLogin} submitLabel="Create portal login" submitClassName="btn-primary" resetOnSuccess>
              <input type="hidden" name="family_id" value={family.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" name="name" defaultValue={holder ? `${holder.first_name} ${holder.last_name}` : ''} required />
                <Field label="Email (their username)" name="email" type="email" defaultValue={holder?.email ?? family.billing_email} required />
              </div>
            </ActionForm>
          </section>
        ) : null}

        {manage ? (
          <section className="card" aria-labelledby="account">
            <h2 id="account" className="card-title mb-3">Account details</h2>
            <ActionForm action={updateFamily} submitLabel="Save account">
              <input type="hidden" name="id" value={family.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Account name" name="account_name" defaultValue={family.account_name} required />
                <Field label="Billing email" name="billing_email" type="email" defaultValue={family.billing_email} />
                <Field label="Phone" name="phone" defaultValue={family.phone} />
                <Field label="Billing address" name="address" defaultValue={family.address} />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={family.notes} rows={2} />
            </ActionForm>
          </section>
        ) : null}

        {finance ? (
          <section className="card lg:col-span-2" aria-labelledby="invoices">
            <h2 id="invoices" className="card-title mb-3">Invoices</h2>
            {invoices.length === 0 ? (
              <p className="text-sm text-ink-soft">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>Invoice</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Family owes</th><th className="text-right">Insurer owes</th></tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td><Link href={`/dashboard/invoices/${i.id}`} className="font-semibold text-teal hover:underline">{i.invoice_number}</Link></td>
                        <td>{formatDate(i.issue_date)}</td>
                        <td><InvoiceStatusBadge status={i.status} daysOverdue={i.days_overdue} /></td>
                        <td className="text-right">{formatIDR(i.total)}</td>
                        <td className="text-right">{i.status === 'void' || i.status === 'draft' ? '—' : formatIDR(i.patient_balance)}</td>
                        <td className="text-right">{i.insurer_id && i.status !== 'void' && i.status !== 'draft' ? formatIDR(i.insurer_balance) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {finance ? (
          <section className="card" aria-labelledby="payments">
            <h2 id="payments" className="card-title mb-3">Recent payments</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-ink-soft">No payments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2">
                    <span>{formatDate(p.paid_at)} · {PAYMENT_METHOD_LABELS[p.method]}{p.payer_type === 'insurer' ? ' (insurer)' : ''}</span>
                    <span className="font-semibold">
                      {formatIDR(p.amount)} {p.status !== 'confirmed' ? <Pill tone="amber">{p.status === 'pending_review' ? 'To review' : 'Rejected'}</Pill> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {finance ? (
          <section className="card" aria-labelledby="claims">
            <h2 id="claims" className="card-title mb-3">Insurance claims</h2>
            {claims.length === 0 ? (
              <p className="text-sm text-ink-soft">No claims.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/dashboard/insurance/${c.id}`} className="text-teal hover:underline">{c.invoice_number} · {c.insurer_name}</Link>
                    <span>{formatIDR(c.amount_claimed)}</span>
                    <ClaimStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
