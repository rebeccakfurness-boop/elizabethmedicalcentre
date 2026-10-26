import { redirect } from 'next/navigation';
import { saveReferralContact } from '@/app/actions/referrals';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Field, Select, TextArea } from '@/components/ui/Field';
import { can, isClinical } from '@/lib/auth';
import { getContacts, type ReferralContact } from '@/lib/referrals';
import { requireStaff } from '@/lib/session';
import { REFERRAL_KIND_LABELS } from '@/clinical/referrals';

const kindOptions = Object.entries(REFERRAL_KIND_LABELS).map(([value, label]) => ({ value, label }));

function ContactFields({ c }: { c?: ReferralContact }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Field label="Name (person, department or service)" name="name" defaultValue={c?.name} required />
      <Field label="Hospital / practice" name="organisation" defaultValue={c?.organisation} />
      <Select label="Type" name="kind" options={kindOptions} defaultValue={c?.kind ?? 'hospital'} />
      <Field label="Specialty / service" name="specialty" defaultValue={c?.specialty} placeholder="e.g. Orthopaedics, Physiotherapy" />
      <Field label="Email (for sending referrals)" name="email" type="email" defaultValue={c?.email} />
      <Field label="Phone / WhatsApp" name="phone" defaultValue={c?.phone} />
      <Field label="Address" name="address" defaultValue={c?.address} className="sm:col-span-2" />
      <TextArea label="Notes (opening hours, how to book, what they offer)" name="notes" defaultValue={c?.notes} rows={2} className="sm:col-span-2" />
      {c ? (
        <Select label="Status" name="is_active" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Hidden' }]} defaultValue={String(c.is_active)} />
      ) : null}
    </div>
  );
}

export default async function ReferralContactsPage() {
  const user = await requireStaff();
  if (!isClinical(user.clinicalRole) && !can(user.role, 'managePatients')) redirect('/dashboard?denied=1');
  const contacts = await getContacts(true);
  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Referrals" title="Referral directory" back={isClinical(user.clinicalRole) ? { href: '/dashboard/referrals', label: 'Referrals' } : undefined} />
      <p className="mb-6 max-w-3xl text-sm text-ink-soft">
        Hospitals, specialists and allied health professionals the clinic refers to. Picking one when writing a referral fills in the recipient and email address.
      </p>
      <section className="card mb-6">
        <h2 className="card-title mb-3">Add a contact</h2>
        <ActionForm action={saveReferralContact} submitLabel="Add contact" resetOnSuccess>
          <ContactFields />
        </ActionForm>
      </section>
      <ul className="space-y-3">
        {contacts.map((c) => (
          <li key={c.id} className={`card ${c.is_active ? '' : 'opacity-60'}`}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-pulse">{c.name}</strong>{c.organisation ? `, ${c.organisation}` : ''}
                  <span className="block text-xs text-ink-soft">{REFERRAL_KIND_LABELS[c.kind]}{c.specialty ? ` · ${c.specialty}` : ''}{c.phone ? ` · ${c.phone}` : ''}</span>
                </span>
                <span className="text-sm">{c.email ?? <span className="text-amber-800">No email</span>}</span>
              </summary>
              <div className="mt-4">
                <ActionForm action={saveReferralContact} submitLabel="Save" submitClassName="btn-ghost btn-sm">
                  <ContactFields c={c} />
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
