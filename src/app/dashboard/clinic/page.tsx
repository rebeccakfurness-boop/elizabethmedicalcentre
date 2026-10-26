import Link from 'next/link';
import { checkInPatient, setEncounterStatus, startConsultation } from '@/app/actions/clinical';
import { AutoRefresh } from '@/components/clinical/AutoRefresh';
import { TriageBadge } from '@/components/clinical/Badges';
import { EmptyState, PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { isClinical } from '@/lib/auth';
import { ENCOUNTER_STATUS_LABELS, getQueue } from '@/lib/clinical';
import { ageFrom } from '@/lib/format';
import { searchPatients } from '@/lib/patients';
import { requirePermission } from '@/lib/session';
import { TRIAGE_INFO } from '@/clinical/triage';

const TYPES = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'home_visit', label: 'Home / hotel visit' },
  { value: 'telemedicine', label: 'Phone / video' },
];

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default async function ClinicBoardPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission('viewPatients');
  const clinical = isClinical(user.clinicalRole);
  const { q = '' } = await searchParams;
  const [queue, results] = await Promise.all([getQueue(), q ? searchPatients(q) : Promise.resolve([])]);
  const active = queue.filter((e) => ['waiting', 'triaged', 'in_consultation'].includes(e.status));
  const done = queue.filter((e) => !['waiting', 'triaged', 'in_consultation'].includes(e.status));

  return (
    <div className="max-w-7xl">
      <AutoRefresh seconds={60} />
      <PageHeader eyebrow="Today" title="Clinic board" />

      <section className="card mb-6">
        <h2 className="card-title mb-3">Check a patient in</h2>
        <form className="mb-3 flex max-w-xl gap-2">
          <input className="input" name="q" defaultValue={q} placeholder="Find patient by name, MRN or phone" aria-label="Find patient" />
          <button className="btn-primary">Find</button>
        </form>
        {q && results.length === 0 ? (
          <p className="text-sm text-ink-soft">No match. <Link href="/dashboard/patients/new" className="text-teal underline">Register a new patient</Link> first.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {results.slice(0, 8).map((p) => (
            <li key={p.id} className="py-3">
              <ActionForm action={checkInPatient} submitLabel="Check in" submitClassName="btn-clay btn-sm" inline resetOnSuccess>
                <input type="hidden" name="patient_id" value={p.id} />
                {clinical ? <input type="hidden" name="then" value="open" /> : null}
                <span className="min-w-48 font-semibold">
                  {p.first_name} {p.last_name}
                  <span className="ml-1 text-xs font-normal text-ink-soft">{p.mrn} · {ageFrom(p.date_of_birth) ?? '?'}y</span>
                  {p.allergies ? <span className="ml-1"><Pill tone="red">Allergy</Pill></span> : null}
                </span>
                <input className="input w-64 py-1.5" name="presenting_complaint" placeholder="Reason for visit, e.g. dog bite on hand" required aria-label="Reason for visit" />
                <select className="input w-auto py-1.5" name="encounter_type" aria-label="Visit type">
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="card-title mb-3">In the clinic ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState>Nobody waiting.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="table">
              <thead>
                <tr><th>Priority</th><th>Patient</th><th>Reason</th><th>Status</th><th>Waiting</th><th></th></tr>
              </thead>
              <tbody>
                {active.map((e) => {
                  const target = e.triage_category ? TRIAGE_INFO[e.triage_category].targetMinutes : 15;
                  const overdue = e.status !== 'in_consultation' && e.minutes_waiting > target;
                  return (
                    <tr key={e.id} className={e.triage_category === 'red' ? 'bg-red-50' : ''}>
                      <td><TriageBadge category={e.triage_category} /></td>
                      <td>
                        {clinical ? (
                          <Link href={`/dashboard/encounters/${e.id}`} className="font-semibold text-teal hover:underline">{e.first_name} {e.last_name}</Link>
                        ) : (
                          <Link href={`/dashboard/patients/${e.patient_id}`} className="font-semibold text-teal hover:underline">{e.first_name} {e.last_name}</Link>
                        )}
                        <span className="block text-xs text-ink-soft">{e.mrn} · {ageFrom(e.date_of_birth) ?? '?'}y{e.allergies ? ' · ⚠ allergy' : ''}</span>
                      </td>
                      <td className="max-w-xs">{e.presenting_complaint}</td>
                      <td className="text-xs">{ENCOUNTER_STATUS_LABELS[e.status]}{e.clinician_name ? <span className="block text-ink-soft">{e.clinician_name}</span> : null}</td>
                      <td className={overdue ? 'font-bold text-red-700' : ''}>{waitLabel(e.minutes_waiting)}{overdue ? ' ⚠' : ''}</td>
                      <td className="whitespace-nowrap text-right">
                        {clinical ? (
                          e.status === 'waiting' ? (
                            <>
                              <Link href={`/dashboard/encounters/${e.id}#triage`} className="btn-clay btn-sm">Triage</Link>{' '}
                              <ActionForm action={startConsultation} submitLabel="See now" submitClassName="btn-ghost btn-sm" inline>
                                <input type="hidden" name="encounter_id" value={e.id} />
                              </ActionForm>
                            </>
                          ) : (
                            <ActionForm action={startConsultation} submitLabel={e.status === 'in_consultation' ? 'Open' : 'See patient'} submitClassName="btn-primary btn-sm" inline>
                              <input type="hidden" name="encounter_id" value={e.id} />
                            </ActionForm>
                          )
                        ) : null}{' '}
                        {e.status !== 'in_consultation' ? (
                          <ActionForm action={setEncounterStatus} submitLabel="Left" submitClassName="btn-ghost btn-sm" inline confirm="Mark this patient as having left before being seen?">
                            <input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="status" value="left" />
                          </ActionForm>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {done.length ? (
        <section>
          <h2 className="card-title mb-3">Seen today</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
            {done.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {clinical ? <Link href={`/dashboard/encounters/${e.id}`} className="text-teal hover:underline">{e.first_name} {e.last_name}</Link> : `${e.first_name} ${e.last_name}`}
                  <span className="ml-2 text-ink-soft">{e.presenting_complaint}</span>
                </span>
                <span className="text-ink-soft">{ENCOUNTER_STATUS_LABELS[e.status]}{e.clinician_name ? ` · ${e.clinician_name}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="mt-6 text-xs text-ink-soft">The board refreshes every minute. Reception sees reasons for visit and priority, never clinical notes.</p>
    </div>
  );
}
