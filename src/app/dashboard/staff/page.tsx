import { createStaffAccount, resetStaffPassword, setClinicalRole, updateStaffAccount } from '@/app/actions/users';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { Field, Select } from '@/components/ui/Field';
import { can, CLINICAL_ROLE_LABELS, type ClinicalRole, ROLE_LABELS, type Role } from '@/lib/auth';
import { sql } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { requirePermission } from '@/lib/session';

export default async function StaffPage() {
  const user = await requirePermission('manageStaffAccounts');
  const staff = await sql<{ id: number; name: string; email: string; role: Role; is_active: boolean; last_login_at: string | null; clinical_role: ClinicalRole | null; registration_number: string | null }>`
    SELECT id, name, email, role, is_active, last_login_at, clinical_role, registration_number FROM users WHERE role <> 'patient' ORDER BY is_active DESC, role DESC, name`;
  const superAdmin = can(user.role, 'manageAdminAccounts');
  const clinicalOptions = (Object.keys(CLINICAL_ROLE_LABELS) as ClinicalRole[]).map((r) => ({ value: r, label: CLINICAL_ROLE_LABELS[r] }));
  const roleOptions = (superAdmin ? (['staff', 'admin', 'super_admin'] as Role[]) : (['staff'] as Role[])).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Admin" title="Staff accounts" />
      <div className="mb-6 grid gap-4 text-sm sm:grid-cols-3">
        <div className="card"><p className="font-semibold">Staff</p><p className="text-ink-soft">Patient cards: view and update medical information.</p></div>
        <div className="card"><p className="font-semibold">Admin</p><p className="text-ink-soft">Everything staff can do, plus create patients and families, portal logins and staff accounts.</p></div>
        <div className="card"><p className="font-semibold">Super admin</p><p className="text-ink-soft">Everything, plus invoicing, insurance, payments and the PIN-locked finance area.</p></div>
      </div>
      <p className="mb-6 max-w-3xl rounded-xl bg-teal-soft p-3 text-sm">
        <strong>Clinical access</strong> is separate from the account role. Doctors, nurses, midwives and pharmacists can read and write clinical notes and triage;
        only doctors can prescribe and approve protocols. Staff without a clinical role never see notes marked “clinical staff only”. Only a super admin can grant clinical access.
      </p>
      <section className="card mb-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Clinical access</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => {
                const editable = s.role === 'staff' || superAdmin;
                return (
                  <tr key={s.id} className={s.is_active ? '' : 'opacity-60'}>
                    <td><p className="font-semibold">{s.name} {s.id === user.id ? <Pill tone="teal">You</Pill> : null}</p><p className="text-xs text-ink-soft">{s.email}</p></td>
                    <td>
                      {editable ? (
                        <ActionForm action={updateStaffAccount} submitLabel="Save" submitClassName="btn-ghost btn-sm" inline>
                          <input type="hidden" name="user_id" value={s.id} />
                          <select name="role" defaultValue={s.role} className="input w-auto py-1.5" aria-label={`Role for ${s.name}`}>
                            {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <select name="is_active" defaultValue={String(s.is_active)} className="input w-auto py-1.5" aria-label={`Status for ${s.name}`}>
                            <option value="true">Active</option>
                            <option value="false">Deactivated</option>
                          </select>
                        </ActionForm>
                      ) : (
                        ROLE_LABELS[s.role]
                      )}
                    </td>
                    <td>
                      {superAdmin ? (
                        <ActionForm action={setClinicalRole} submitLabel="Save" submitClassName="btn-ghost btn-sm" inline>
                          <input type="hidden" name="user_id" value={s.id} />
                          <select name="clinical_role" defaultValue={s.clinical_role ?? ''} className="input w-auto py-1.5" aria-label={`Clinical role for ${s.name}`}>
                            <option value="">None</option>
                            {clinicalOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <input name="registration_number" defaultValue={s.registration_number ?? ''} placeholder="STR / SIP no." className="input w-32 py-1.5" aria-label={`Registration number for ${s.name}`} />
                        </ActionForm>
                      ) : s.clinical_role ? CLINICAL_ROLE_LABELS[s.clinical_role] : '—'}
                    </td>
                    <td>{s.last_login_at ? formatDate(s.last_login_at) : 'Never'}</td>
                    <td className="text-right">
                      {editable && s.id !== user.id ? (
                        <ActionForm action={resetStaffPassword} submitLabel="Reset password" submitClassName="btn-ghost btn-sm" inline confirm={`Issue a new temporary password for ${s.name}?`}>
                          <input type="hidden" name="user_id" value={s.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card max-w-xl">
        <h2 className="card-title mb-3">Add a staff account</h2>
        <ActionForm action={createStaffAccount} submitLabel="Create account" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Work email" name="email" type="email" required />
            <Select label="Role" name="role" options={roleOptions} />
            {superAdmin ? (
              <>
                <Select label="Clinical access" name="clinical_role" placeholder="None (non-clinical)" options={clinicalOptions} />
                <Field label="Registration no. (STR/SIP)" name="registration_number" />
              </>
            ) : null}
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
