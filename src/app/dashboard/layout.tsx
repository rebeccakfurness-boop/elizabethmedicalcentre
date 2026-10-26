import { logout } from '@/app/actions/auth';
import { Sidebar, type NavItem } from '@/components/dashboard/Sidebar';
import { can, CLINICAL_ROLE_LABELS, isClinical, ROLE_LABELS } from '@/lib/auth';
import { requireStaff } from '@/lib/session';

export const metadata = { title: 'Dashboard – The Doctors', robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const items: NavItem[] = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/clinic', label: 'Clinic today', section: 'Clinic' },
    { href: '/dashboard/appointments', label: 'Appointments', section: 'Clinic' },
  ];
  if (isClinical(user.clinicalRole)) {
    items.push(
      { href: '/dashboard/labs', label: 'Blood tests', section: 'Clinic' },
      { href: '/dashboard/referrals', label: 'Referrals', section: 'Clinic' },
      { href: '/dashboard/protocols', label: 'Protocols', section: 'Clinic' },
      { href: '/dashboard/formulary', label: 'Formulary & leaflets', section: 'Clinic' }
    );
  }
  items.push(
    { href: '/dashboard/patients', label: 'Patients', section: 'Patients' },
    { href: '/dashboard/families', label: 'Family accounts', section: 'Patients' }
  );
  if (!isClinical(user.clinicalRole) && can(user.role, 'managePatients')) {
    items.push({ href: '/dashboard/referrals/contacts', label: 'Referral directory', section: 'Patients' });
  }
  items.push(
    { href: '/dashboard/operations', label: 'Overview', section: 'Operations' },
    { href: '/dashboard/operations/checklists', label: 'Daily checklists', section: 'Operations' },
    { href: '/dashboard/operations/inventory', label: 'Inventory', section: 'Operations' },
    { href: '/dashboard/operations/projects', label: 'Project boards', section: 'Operations' }
  );
  if (can(user.role, 'finance')) {
    items.push(
      { href: '/dashboard/invoices', label: 'Invoices', section: 'Billing' },
      { href: '/dashboard/payments', label: 'Payments', section: 'Billing' },
      { href: '/dashboard/insurance', label: 'Insurance claims', section: 'Billing' },
      { href: '/dashboard/budget', label: 'Budget tracker', section: 'Finance', locked: true },
      { href: '/dashboard/budget/bills', label: 'Bills to pay', section: 'Finance', locked: true },
      { href: '/dashboard/budget/bank', label: 'Bank statements', section: 'Finance', locked: true },
      { href: '/dashboard/budget/transactions', label: 'Transactions', section: 'Finance', locked: true }
    );
  }
  if (can(user.role, 'manageStaffAccounts')) {
    items.push({ href: '/dashboard/staff', label: 'Staff accounts', section: 'Admin' });
  }
  if (can(user.role, 'finance')) {
    items.push({ href: '/dashboard/settings', label: 'Clinic settings', section: 'Admin' });
  }

  return (
    <div className="min-h-screen bg-paper lg:flex">
      <Sidebar items={items} userName={user.name} roleLabel={user.clinicalRole ? `${CLINICAL_ROLE_LABELS[user.clinicalRole]} · ${ROLE_LABELS[user.role]}` : ROLE_LABELS[user.role]} logoutAction={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
