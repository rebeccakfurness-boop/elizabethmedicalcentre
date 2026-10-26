'use client';

import { useActionState, useMemo, useState } from 'react';
import type { FormState } from '@/app/actions/auth';
import { computeInvoiceTotals } from '@/lib/billing-shared';
import { formatIDR } from '@/lib/format';

interface Member {
  id: number;
  name: string;
  insurerId: number | null;
}

interface Line {
  key: number;
  patientId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  insuranceCovered: boolean;
}

export interface InvoiceFormInitial {
  id?: number;
  encounterId?: number | null;
  isDraft?: boolean;
  familyId: number;
  billedToName: string;
  issueDate: string;
  dueDate: string;
  discount: number;
  insurerId: number | null;
  notes: string;
  items: Omit<Line, 'key'>[];
}

// Suggestions only; staff can type anything.
const COMMON_ITEMS = [
  'GP consultation',
  'Specialist consultation',
  'After-hours consultation',
  'Home / hotel visit',
  'Wound care & dressing',
  'IV drip therapy',
  'Injection',
  'Laboratory test',
  'Rapid test',
  'Medication',
  'Medical certificate',
  'Fit-to-fly certificate',
];

export function InvoiceForm({
  action,
  initial,
  members,
  insurers,
  taxRate,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  initial: InvoiceFormInitial;
  members: Member[];
  insurers: { id: number; name: string }[];
  taxRate: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [insurerId, setInsurerId] = useState<number | null>(initial.insurerId);
  const [discount, setDiscount] = useState(initial.discount);
  const [nextKey, setNextKey] = useState(initial.items.length + 1);
  const [lines, setLines] = useState<Line[]>(
    initial.items.length
      ? initial.items.map((it, i) => ({ ...it, key: i }))
      : [{ key: 0, patientId: members[0]?.id ?? null, description: '', quantity: 1, unitPrice: 0, insuranceCovered: !!initial.insurerId }]
  );

  const totals = useMemo(() => computeInvoiceTotals(lines, discount, taxRate, !!insurerId), [lines, discount, taxRate, insurerId]);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const last = lines[lines.length - 1];
    setLines((ls) => [...ls, { key: nextKey, patientId: last?.patientId ?? members[0]?.id ?? null, description: '', quantity: 1, unitPrice: 0, insuranceCovered: !!insurerId }]);
    setNextKey((k) => k + 1);
  }

  return (
    <form action={formAction} className="space-y-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="family_id" value={initial.familyId} />
      {initial.encounterId ? <input type="hidden" name="encounter_id" value={initial.encounterId} /> : null}
      <input type="hidden" name="items" value={JSON.stringify(lines.map(({ key: _key, ...l }) => l))} />
      <datalist id="common-items">
        {COMMON_ITEMS.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="billed_to_name">Billed to *</label>
          <input className="input" id="billed_to_name" name="billed_to_name" defaultValue={initial.billedToName} required />
        </div>
        <div>
          <label className="label" htmlFor="issue_date">Issue date *</label>
          <input className="input" id="issue_date" name="issue_date" type="date" defaultValue={initial.issueDate} required />
        </div>
        <div>
          <label className="label" htmlFor="due_date">Due date *</label>
          <input className="input" id="due_date" name="due_date" type="date" defaultValue={initial.dueDate} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="insurer_id">Bill insurance to</label>
          <select
            className="input"
            id="insurer_id"
            name="insurer_id"
            value={insurerId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setInsurerId(v);
              setLines((ls) => ls.map((l) => ({ ...l, insuranceCovered: !!v && (l.insuranceCovered || !insurerId) })));
            }}
          >
            <option value="">No insurance (family pays everything)</option>
            {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="table min-w-[760px]">
          <thead>
            <tr>
              <th className="w-44">Patient</th>
              <th>Description</th>
              <th className="w-20 text-right">Qty</th>
              <th className="w-36 text-right">Unit price (Rp)</th>
              {insurerId ? <th className="w-20 text-center">Insured</th> : null}
              <th className="w-36 text-right">Amount</th>
              <th className="w-10"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.key}>
                <td>
                  <select className="input py-2" aria-label={`Patient for line ${idx + 1}`} value={l.patientId ?? ''} onChange={(e) => update(l.key, { patientId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Family (general)</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td>
                  <input className="input py-2" list="common-items" aria-label={`Description for line ${idx + 1}`} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="e.g. GP consultation" />
                </td>
                <td>
                  <input className="input py-2 text-right" type="number" min="0" step="0.5" aria-label={`Quantity for line ${idx + 1}`} value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} />
                </td>
                <td>
                  <input className="input py-2 text-right" type="number" min="0" step="1000" aria-label={`Unit price for line ${idx + 1}`} value={l.unitPrice || ''} onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })} placeholder="0" />
                </td>
                {insurerId ? (
                  <td className="text-center">
                    <input type="checkbox" className="h-4 w-4 accent-teal" aria-label={`Insurance covers line ${idx + 1}`} checked={l.insuranceCovered} onChange={(e) => update(l.key, { insuranceCovered: e.target.checked })} />
                  </td>
                ) : null}
                <td className="text-right font-medium">{formatIDR(Math.round(l.quantity * l.unitPrice))}</td>
                <td>
                  {lines.length > 1 ? (
                    <button type="button" className="text-ink-soft hover:text-red-700" aria-label={`Remove line ${idx + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3">
          <button type="button" className="btn-ghost btn-sm" onClick={addLine}>+ Add line</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="discount">Discount (Rp)</label>
            <input className="input max-w-xs" id="discount" name="discount" type="number" min="0" step="1000" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="0" />
          </div>
          <div>
            <label className="label" htmlFor="notes">Notes on the invoice</label>
            <textarea className="input" id="notes" name="notes" rows={3} defaultValue={initial.notes} />
          </div>
        </div>
        <dl className="space-y-1.5 rounded-2xl bg-paper p-5 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatIDR(totals.subtotal)}</dd></div>
          {totals.discount ? <div className="flex justify-between"><dt>Discount</dt><dd>− {formatIDR(totals.discount)}</dd></div> : null}
          {totals.tax ? <div className="flex justify-between"><dt>Tax ({taxRate}%)</dt><dd>{formatIDR(totals.tax)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-2 font-headline text-lg font-extrabold text-pulse"><dt>Total</dt><dd>{formatIDR(totals.total)}</dd></div>
          {insurerId ? (
            <>
              <div className="flex justify-between text-teal"><dt>Insurer pays</dt><dd>{formatIDR(totals.insurerPortion)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Family pays</dt><dd>{formatIDR(totals.patientPortion)}</dd></div>
            </>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" name="intent" value="issue" className="btn-clay" disabled={pending}>
          {pending ? 'Saving…' : !initial.id ? 'Create & issue' : initial.isDraft ? 'Save & issue' : 'Save changes'}
        </button>
        {!initial.id || initial.isDraft ? (
          <button type="submit" name="intent" value="draft" className="btn-ghost" disabled={pending}>Save as draft</button>
        ) : null}
        {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      </div>
    </form>
  );
}
