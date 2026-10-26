import Link from 'next/link';
import { createLabOrder } from '@/app/actions/labs';
import { ActionForm } from '@/components/ui/ActionForm';
import { Pill } from '@/components/ui/Badges';
import { FLAG_LABELS, LAB_DESTINATIONS, LAB_TESTS, type Flag } from '@/clinical/labs';
import { formatClinicTime } from '@/lib/format';
import { LAB_STATUS_LABELS, testNames, type LabOrderRow, type LabResultRow } from '@/lib/labs';

export function LabFlag({ flag }: { flag: Flag }) {
  if (!flag) return null;
  const critical = flag === 'LL' || flag === 'HH';
  return (
    <span className={`pill ${critical ? 'bg-red-600 text-white' : flag === 'A' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`} title={FLAG_LABELS[flag]}>
      {critical ? '‼ ' : ''}{flag === 'A' ? 'Abnormal' : flag}
    </span>
  );
}

export function LabStatusBadge({ order }: { order: Pick<LabOrderRow, 'status' | 'critical_count' | 'abnormal_count'> }) {
  if (order.status === 'resulted') {
    return order.critical_count ? <Pill tone="red">‼ Critical: review now</Pill> : <Pill tone="amber">{LAB_STATUS_LABELS.resulted}</Pill>;
  }
  if (order.status === 'reviewed') return <Pill tone="teal">Reviewed{order.abnormal_count ? ` · ${order.abnormal_count} abnormal` : ''}</Pill>;
  return <Pill>{LAB_STATUS_LABELS[order.status]}</Pill>;
}

/** Tick-box order form. Tests suggested by the visit's protocol are pre-ticked. */
export function LabOrderForm({ patientId, encounterId, suggested = [], openAfter = false }: { patientId: number; encounterId?: number | null; suggested?: string[]; openAfter?: boolean }) {
  const groups = Array.from(new Set(LAB_TESTS.map((t) => t.group)));
  return (
    <ActionForm action={createLabOrder} submitLabel="Order tests" submitClassName="btn-clay btn-sm" resetOnSuccess>
      <input type="hidden" name="patient_id" value={patientId} />
      {encounterId ? <input type="hidden" name="encounter_id" value={encounterId} /> : null}
      {openAfter ? <input type="hidden" name="then" value="open" /> : null}
      {suggested.length ? <p className="text-xs text-teal">✓ Tests suggested by the protocol are ticked. Untick any you don’t need.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g}>
            <legend className="label">{g}</legend>
            {LAB_TESTS.filter((t) => t.group === g).map((t) => (
              <label key={t.code} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" name="tests" value={t.code} defaultChecked={suggested.includes(t.code)} className="h-4 w-4 accent-teal" />
                <span>{t.name}{suggested.includes(t.code) ? <span className="ml-1 text-xs text-teal">(suggested)</span> : null}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label" htmlFor={`other-${encounterId ?? patientId}`}>Other tests</label>
          <input className="input" id={`other-${encounterId ?? patientId}`} name="other_tests" placeholder="e.g. Widal, ferritin, blood culture" />
        </div>
        <div>
          <label className="label" htmlFor={`lab-${encounterId ?? patientId}`}>Lab</label>
          <input className="input" id={`lab-${encounterId ?? patientId}`} name="lab_name" list="lab-destinations" defaultValue={LAB_DESTINATIONS[0]} />
          <datalist id="lab-destinations">{LAB_DESTINATIONS.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor={`urg-${encounterId ?? patientId}`}>Urgency</label>
          <select className="input" id={`urg-${encounterId ?? patientId}`} name="urgency" defaultValue="routine">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent (same day)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="fasting" className="h-4 w-4 accent-teal" /> Fasting sample
        </label>
        <div className="sm:col-span-3">
          <label className="label" htmlFor={`cd-${encounterId ?? patientId}`}>Clinical details for the lab</label>
          <input className="input" id={`cd-${encounterId ?? patientId}`} name="clinical_details" placeholder="e.g. Fever day 4, ?dengue" />
        </div>
      </div>
    </ActionForm>
  );
}

/** Compact list of orders with their key results, used on visits and the patient card. */
export function LabOrderList({ orders, results }: { orders: LabOrderRow[]; results: LabResultRow[] }) {
  if (!orders.length) return <p className="text-sm text-ink-soft">No blood tests ordered.</p>;
  return (
    <ul className="space-y-2">
      {orders.map((o) => {
        const rs = results.filter((r) => r.order_id === o.id);
        return (
          <li key={o.id} className={`rounded-xl border px-3 py-2 text-sm ${o.status === 'cancelled' ? 'border-line opacity-60' : o.critical_count ? 'border-red-400' : 'border-line'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/dashboard/labs/${o.id}`} className="font-semibold text-teal hover:underline">{testNames(o)}</Link>
              <LabStatusBadge order={o} />
            </div>
            <p className="text-xs text-ink-soft">{formatClinicTime(o.created_at)} · {o.ordered_by_name}{o.lab_name ? ` · ${o.lab_name}` : ''}{o.urgency === 'urgent' ? ' · URGENT' : ''}</p>
            {rs.length ? (
              <p className="mt-1 text-xs">
                {rs.map((r, i) => (
                  <span key={r.id} className={r.flag ? 'font-semibold text-red-800' : ''}>
                    {i ? ' · ' : ''}{r.name} {r.value}{r.unit ? ` ${r.unit}` : ''}{r.flag && r.flag !== 'A' ? ` (${r.flag})` : ''}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
