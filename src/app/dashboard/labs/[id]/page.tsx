import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cancelLabOrder,
  deleteLabResult,
  markSampleCollected,
  readLabAttachment,
  reviewLabOrder,
  saveLabResults,
  uploadLabReport,
} from '@/app/actions/labs';
import { LabFlag, LabStatusBadge } from '@/components/clinical/Labs';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActionForm } from '@/components/ui/ActionForm';
import { canPrescribe } from '@/lib/auth';
import { ageFrom, formatClinicTime, formatDate } from '@/lib/format';
import { labReaderAvailable } from '@/lib/lab-read';
import { getLabAttachments, getLabOrder, getLabResults, getPreviousValues, testNames, type ExtractedResult } from '@/lib/labs';
import { audit, requireClinical } from '@/lib/session';
import { EXTRA_RESULT_ROWS, LAB_TESTS_BY_CODE, rangeText } from '@/clinical/labs';

export default async function LabOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClinical();
  const order = await getLabOrder(Number((await params).id));
  if (!order) notFound();
  await audit(user.id, 'view', 'lab_order', order.id);
  const [results, attachments, previous] = await Promise.all([getLabResults([order.id]), getLabAttachments([order.id]), getPreviousValues(order.patient_id, order.id)]);
  const doctor = canPrescribe(user.clinicalRole);
  const byCode = new Map(results.filter((r) => r.analyte_code).map((r) => [r.analyte_code!, r]));
  const extras = results.filter((r) => !r.analyte_code);
  // Latest values read from a report fill the blanks (never overwrite saved results).
  const extracted: ExtractedResult[] = [...attachments].reverse().find((a) => a.extracted?.length)?.extracted ?? [];
  const extractedByCode = new Map(extracted.filter((e) => e.analyteCode).map((e) => [e.analyteCode!, e]));
  const savedExtraNames = new Set(results.filter((r) => !r.analyte_code).map((r) => r.name.toLowerCase()));
  const extractedExtras = extracted.filter((e) => !e.analyteCode && !savedExtraNames.has(e.name.toLowerCase())).slice(0, EXTRA_RESULT_ROWS);
  // Analytes on the form: ordered tests, plus anything already saved or read from the report.
  const tests = order.test_codes.map((c) => LAB_TESTS_BY_CODE.get(c)).filter((t) => !!t);
  const knownCodes = new Set([...byCode.keys(), ...extractedByCode.keys()]);
  for (const t of LAB_TESTS_BY_CODE.values()) {
    if (!order.test_codes.includes(t.code) && t.analytes.some((a) => knownCodes.has(a.code))) tests.push(t);
  }
  const editable = order.status !== 'cancelled';
  const age = ageFrom(order.date_of_birth);
  const hasUnsavedExtraction = extracted.some((e) => (e.analyteCode ? !byCode.has(e.analyteCode) : true));

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow={`Blood tests · ordered ${formatClinicTime(order.created_at)} by ${order.ordered_by_name}`}
        title={`${order.first_name} ${order.last_name}`}
        back={order.encounter_id ? { href: `/dashboard/encounters/${order.encounter_id}`, label: 'Visit' } : { href: '/dashboard/labs', label: 'Blood tests' }}
        actions={
          <>
            <Link href={`/dashboard/patients/${order.patient_id}`} className="btn-ghost btn-sm">Patient card</Link>
            <a href={`/print/lab-request/${order.id}`} target="_blank" rel="noreferrer" className="btn-primary btn-sm">🖨 Lab request form</a>
          </>
        }
      />

      <section className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">{testNames(order)}</p>
            <p className="text-ink-soft">
              {order.mrn} · {age != null ? `${age} years` : 'age unknown'}{order.sex ? ` · ${order.sex}` : ''} · {order.lab_name ?? 'Lab not set'}
              {order.urgency === 'urgent' ? ' · URGENT' : ''}{order.fasting ? ' · fasting' : ''}
            </p>
            {order.clinical_details ? <p className="mt-1">Clinical details: {order.clinical_details}</p> : null}
            {order.collected_at ? <p className="text-xs text-ink-soft">Sample taken {formatClinicTime(order.collected_at)}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <LabStatusBadge order={order} />
            {order.status === 'ordered' ? (
              <ActionForm action={markSampleCollected} submitLabel="Sample taken" submitClassName="btn-ghost btn-sm" inline>
                <input type="hidden" name="order_id" value={order.id} />
              </ActionForm>
            ) : null}
            {['ordered', 'collected'].includes(order.status) ? (
              <ActionForm action={cancelLabOrder} submitLabel="Cancel order" submitClassName="text-xs text-ink-soft underline" inline confirm="Cancel this lab order?">
                <input type="hidden" name="order_id" value={order.id} />
              </ActionForm>
            ) : null}
          </div>
        </div>
      </section>

      {editable ? (
        <section className="card mb-6">
          <h2 className="card-title mb-3">Lab report</h2>
          {attachments.length ? (
            <ul className="mb-4 space-y-2 text-sm">
              {attachments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <a href={`/api/files/${a.file_id}`} target="_blank" rel="noreferrer" className="text-teal underline">📄 {a.file_name}</a>
                  <span className="flex items-center gap-2 text-xs text-ink-soft">
                    {formatClinicTime(a.created_at)}{a.shared_with_patient ? ' · shared with patient' : ''}
                    {labReaderAvailable() && !a.extracted ? (
                      <ActionForm action={readLabAttachment} submitLabel="Read values from report" submitClassName="btn-ghost btn-sm" inline>
                        <input type="hidden" name="attachment_id" value={a.id} />
                      </ActionForm>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={uploadLabReport} submitLabel="Upload report" submitClassName="btn-primary btn-sm" resetOnSuccess>
            <input type="hidden" name="order_id" value={order.id} />
            <input type="file" name="report" accept="application/pdf,image/*" className="block text-sm" aria-label="Lab report file" />
            {labReaderAvailable() ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="read" defaultChecked className="mt-0.5 h-4 w-4 accent-teal" />
                <span>Read the values from the report and fill them in for me to check. <span className="text-ink-soft">The report is sent to Anthropic’s API to be read; nothing is saved until you press Save results.</span></span>
              </label>
            ) : null}
          </ActionForm>
        </section>
      ) : null}

      <section className="card mb-6">
        <h2 className="card-title mb-1">Results</h2>
        {hasUnsavedExtraction && editable ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Values read from the report are filled in below (highlighted). Check each one against the report before saving.
          </p>
        ) : (
          <p className="mb-3 text-sm text-ink-soft">Leave a box empty if there is no result. The reference range defaults to ours; replace it with the lab’s range from the report. H/L flags are worked out when you save.</p>
        )}
        {editable ? (
          <ActionForm action={saveLabResults} submitLabel="Save results" submitClassName="btn-primary">
            <input type="hidden" name="order_id" value={order.id} />
            {tests.map((t) => (
              <fieldset key={t!.code} className="mb-2">
                <legend className="label">{t!.name}</legend>
                <div className="overflow-x-auto">
                  <table className="table text-sm">
                    <thead><tr><th className="w-44">Test</th><th>Result</th><th className="w-28">Unit</th><th className="w-32">Range</th><th>Flag</th><th>Previous</th></tr></thead>
                    <tbody>
                      {t!.analytes.map((a) => {
                        const saved = byCode.get(a.code);
                        const read = !saved ? extractedByCode.get(a.code) : undefined;
                        const value = saved?.value ?? read?.value ?? '';
                        const prev = previous.get(a.code) ?? [];
                        return (
                          <tr key={a.code} className={read ? 'bg-amber-50' : ''}>
                            <td className="font-semibold">{a.name}<input type="hidden" name="analyte" value={a.code} /></td>
                            <td>
                              {a.options && !read ? (
                                <select name={`value_${a.code}`} defaultValue={value} className="input py-1.5" aria-label={a.name}>
                                  <option value="">—</option>
                                  {a.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                  {value && !a.options.includes(value) ? <option value={value}>{value}</option> : null}
                                </select>
                              ) : (
                                <input name={`value_${a.code}`} defaultValue={value} className="input py-1.5" aria-label={a.name} inputMode={a.options ? 'text' : 'decimal'} />
                              )}
                            </td>
                            <td><input name={`unit_${a.code}`} defaultValue={saved?.unit ?? read?.unit ?? a.unit ?? ''} className="input py-1.5" aria-label={`${a.name} unit`} /></td>
                            <td><input name={`range_${a.code}`} defaultValue={saved?.ref_range ?? read?.refRange ?? rangeText(a, order.sex) ?? ''} className="input py-1.5" aria-label={`${a.name} reference range`} /></td>
                            <td><LabFlag flag={saved?.flag ?? null} /></td>
                            <td className="whitespace-nowrap text-xs text-ink-soft">{prev.map((p) => `${p.value} (${formatDate(p.date)})`).join(' · ') || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </fieldset>
            ))}
            {extras.length ? (
              <div>
                <p className="label">Other results</p>
                <ul className="space-y-1 text-sm">
                  {extras.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <strong>{r.name}</strong> {r.value}{r.unit ? ` ${r.unit}` : ''}{r.ref_range ? ` (range ${r.ref_range})` : ''} <LabFlag flag={r.flag} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {/* Keyed on what's saved so these rows empty themselves once their results are stored. */}
            <details key={`extras-${extras.length}`} open={extractedExtras.length > 0}>
              <summary className="cursor-pointer text-sm text-teal">+ Add results not listed above</summary>
              <div className="mt-2 space-y-2">
                {Array.from({ length: EXTRA_RESULT_ROWS }, (_, i) => {
                  const e = extractedExtras[i];
                  return (
                    <div key={i} className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${e ? 'rounded-lg bg-amber-50 p-1' : ''}`}>
                      <input name={`extra_name_${i}`} defaultValue={e?.name ?? ''} placeholder="Test name" className="input py-1.5" aria-label={`Other test ${i + 1} name`} />
                      <input name={`extra_value_${i}`} defaultValue={e?.value ?? ''} placeholder="Result" className="input py-1.5" aria-label={`Other test ${i + 1} result`} />
                      <input name={`extra_unit_${i}`} defaultValue={e?.unit ?? ''} placeholder="Unit" className="input py-1.5" aria-label={`Other test ${i + 1} unit`} />
                      <input name={`extra_range_${i}`} defaultValue={e?.refRange ?? ''} placeholder="Range" className="input py-1.5" aria-label={`Other test ${i + 1} range`} />
                    </div>
                  );
                })}
              </div>
            </details>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-soft">This order was cancelled.</p>
        )}
        {extras.length && editable ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {extras.map((r) => (
              <ActionForm key={r.id} action={deleteLabResult} submitLabel={`Remove “${r.name}”`} submitClassName="text-xs text-ink-soft underline" inline confirm={`Remove the ${r.name} result?`}>
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="result_id" value={r.id} />
              </ActionForm>
            ))}
          </div>
        ) : null}
      </section>

      {results.length || attachments.length ? (
        <section className="card border-teal/40">
          <h2 className="card-title mb-1">Doctor review and sharing</h2>
          {order.reviewed_at ? (
            <p className="mb-3 text-sm">Reviewed by <strong>{order.reviewed_by_name}</strong> on {formatClinicTime(order.reviewed_at)}.{order.review_comment ? ` “${order.review_comment}”` : ''}</p>
          ) : null}
          {doctor ? (
            <ActionForm action={reviewLabOrder} submitLabel={order.status === 'reviewed' ? 'Update review and sharing' : 'Mark reviewed'} submitClassName="btn-clay">
              <input type="hidden" name="order_id" value={order.id} />
              <p className="text-sm text-ink-soft">Tick what the patient can see in their portal. Anything not ticked stays on the clinical record only.</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {results.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="share_result" value={r.id} defaultChecked={r.shared_with_patient} className="h-4 w-4 accent-teal" />
                      <span><strong>{r.name}</strong> {r.value}{r.unit ? ` ${r.unit}` : ''}{r.ref_range ? <span className="text-ink-soft"> (range {r.ref_range})</span> : null}</span>
                    </label>
                    <LabFlag flag={r.flag} />
                  </li>
                ))}
                {attachments.map((a) => (
                  <li key={`a${a.id}`} className="px-3 py-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="share_attachment" value={a.id} defaultChecked={a.shared_with_patient} className="h-4 w-4 accent-teal" />
                      <span>📄 Full lab report: {a.file_name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="review_comment">🔒 Clinical comment (staff only)</label>
                  <textarea className="input" id="review_comment" name="review_comment" rows={3} defaultValue={order.review_comment ?? ''} placeholder="Interpretation, action taken" />
                </div>
                <div>
                  <label className="label" htmlFor="patient_comment">🏠 Message to the patient (shown with shared results)</label>
                  <textarea className="input" id="patient_comment" name="patient_comment" rows={3} defaultValue={order.patient_comment ?? ''} placeholder="e.g. Your blood count is normal. Keep drinking plenty of fluids." />
                </div>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-soft">A doctor needs to review these results and decide what to share with the patient.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
