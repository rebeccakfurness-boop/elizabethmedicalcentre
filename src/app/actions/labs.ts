'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/app/actions/auth';
import { sql, transaction } from '@/lib/db';
import { fileFrom, readStoredFile, saveUpload } from '@/lib/files';
import { errorMessage, num, str } from '@/lib/form';
import { readLabReport } from '@/lib/lab-read';
import { getLabOrder, type LabOrderRow } from '@/lib/labs';
import { audit, requireClinical, requirePrescriber } from '@/lib/session';
import { ANALYTES_BY_CODE, EXTRA_RESULT_ROWS as EXTRA_ROWS, flagResult, LAB_TESTS_BY_CODE, parseNumber } from '@/clinical/labs';


function orderPath(id: number) {
  return `/dashboard/labs/${id}`;
}

function revalidateOrder(order: Pick<LabOrderRow, 'id' | 'patient_id' | 'encounter_id'>) {
  revalidatePath(orderPath(order.id));
  revalidatePath('/dashboard/labs');
  revalidatePath(`/dashboard/patients/${order.patient_id}`);
  if (order.encounter_id) revalidatePath(`/dashboard/encounters/${order.encounter_id}`);
}

export async function createLabOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const patientId = num(fd, 'patient_id');
  const encounterId = num(fd, 'encounter_id');
  const tests = [...new Set(fd.getAll('tests').map(String))].filter((c) => LAB_TESTS_BY_CODE.has(c));
  const other = str(fd, 'other_tests');
  if (!patientId) return { error: 'Missing patient.' };
  if (!tests.length && !other) return { error: 'Tick at least one test, or type the test you need.' };
  if (encounterId) {
    const ok = await sql`SELECT 1 FROM encounters WHERE id = ${encounterId} AND patient_id = ${patientId}`;
    if (!ok.length) return { error: 'That visit belongs to another patient.' };
  }
  const urgency = str(fd, 'urgency') === 'urgent' ? 'urgent' : 'routine';
  const [row] = await sql<{ id: number }>`
    INSERT INTO lab_orders (patient_id, encounter_id, ordered_by, test_codes, other_tests, lab_name, urgency, fasting, clinical_details)
    VALUES (${patientId}, ${encounterId}, ${user.id}, ${tests}, ${other}, ${str(fd, 'lab_name')}, ${urgency},
      ${str(fd, 'fasting') === 'on'}, ${str(fd, 'clinical_details')})
    RETURNING id`;
  await audit(user.id, 'order_labs', 'lab_order', row.id, tests.join(','));
  revalidateOrder({ id: row.id, patient_id: patientId, encounter_id: encounterId });
  if (str(fd, 'then') === 'open') redirect(orderPath(row.id));
  return { ok: 'Tests ordered. Print the request form for the lab.' };
}

async function loadOrder(fd: FormData) {
  const id = num(fd, 'order_id');
  return id ? getLabOrder(id) : null;
}

export async function markSampleCollected(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const order = await loadOrder(fd);
  if (!order || order.status !== 'ordered') return { error: 'This order can’t be changed.' };
  await sql`UPDATE lab_orders SET status = 'collected', collected_at = now() WHERE id = ${order.id}`;
  await audit(user.id, 'lab_collected', 'lab_order', order.id);
  revalidateOrder(order);
  return { ok: 'Marked as sample taken.' };
}

export async function cancelLabOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const order = await loadOrder(fd);
  if (!order || !['ordered', 'collected'].includes(order.status)) return { error: 'Only orders without results can be cancelled.' };
  await sql`UPDATE lab_orders SET status = 'cancelled' WHERE id = ${order.id}`;
  await audit(user.id, 'lab_cancelled', 'lab_order', order.id);
  revalidateOrder(order);
  return { ok: 'Order cancelled.' };
}

/**
 * Saves the results form: one row per catalogue analyte (value_<code>, unit_<code>, range_<code>)
 * plus a few free rows for anything else on the report. Changing results after review sends the
 * order back for review, so nothing reaches the patient that a doctor hasn't seen.
 */
export async function saveLabResults(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const order = await loadOrder(fd);
  if (!order || order.status === 'cancelled') return { error: 'This order can’t take results.' };
  const sex = order.sex;
  const analyteCodes = [...new Set(fd.getAll('analyte').map(String))].filter((c) => ANALYTES_BY_CODE.has(c));
  let changed = 0;
  await transaction(async (q) => {
    let sort = 0;
    for (const code of analyteCodes) {
      const a = ANALYTES_BY_CODE.get(code)!;
      const value = str(fd, `value_${code}`);
      const existing = await q<{ id: number; value: string; unit: string | null; ref_range: string | null }>`
        SELECT id, value, unit, ref_range FROM lab_results WHERE order_id = ${order.id} AND analyte_code = ${code}`;
      sort++;
      if (!value) {
        if (existing.length) {
          await q`DELETE FROM lab_results WHERE id = ${existing[0].id}`;
          changed++;
        }
        continue;
      }
      const unit = str(fd, `unit_${code}`) ?? a.unit ?? null;
      const range = str(fd, `range_${code}`);
      if (existing.length && existing[0].value === value && existing[0].unit === unit && existing[0].ref_range === range) continue;
      const flag = flagResult(code, value, sex, range);
      await q`
        INSERT INTO lab_results (order_id, test_code, analyte_code, name, value, numeric_value, unit, ref_range, flag, entered_by, sort_order)
        VALUES (${order.id}, ${a.testCode}, ${code}, ${a.name}, ${value}, ${parseNumber(value)}, ${unit}, ${range}, ${flag}, ${user.id}, ${sort})
        ON CONFLICT (order_id, analyte_code) DO UPDATE SET value = EXCLUDED.value, numeric_value = EXCLUDED.numeric_value,
          unit = EXCLUDED.unit, ref_range = EXCLUDED.ref_range, flag = EXCLUDED.flag, entered_by = EXCLUDED.entered_by, entered_at = now()`;
      changed++;
    }
    for (let i = 0; i < EXTRA_ROWS; i++) {
      const name = str(fd, `extra_name_${i}`);
      const value = str(fd, `extra_value_${i}`);
      if (!name || !value) continue;
      const range = str(fd, `extra_range_${i}`);
      await q`
        INSERT INTO lab_results (order_id, name, value, numeric_value, unit, ref_range, flag, entered_by, sort_order)
        VALUES (${order.id}, ${name}, ${value}, ${parseNumber(value)}, ${str(fd, `extra_unit_${i}`)}, ${range},
          ${flagResult(null, value, sex, range)}, ${user.id}, ${100 + i})`;
      changed++;
    }
    if (changed) {
      const [{ n }] = await q<{ n: number }>`SELECT COUNT(*)::int AS n FROM lab_results WHERE order_id = ${order.id}`;
      if (n > 0) {
        await q`UPDATE lab_orders SET status = 'resulted', resulted_at = COALESCE(resulted_at, now()),
          collected_at = COALESCE(collected_at, now()), reviewed_at = NULL, reviewed_by = NULL WHERE id = ${order.id}`;
      } else {
        await q`UPDATE lab_orders SET status = CASE WHEN collected_at IS NULL THEN 'ordered' ELSE 'collected' END,
          resulted_at = NULL, reviewed_at = NULL, reviewed_by = NULL WHERE id = ${order.id}`;
      }
    }
  });
  if (!changed) return { ok: 'No changes.' };
  await audit(user.id, 'lab_results', 'lab_order', order.id, `${changed} changed`);
  revalidateOrder(order);
  return { ok: order.status === 'reviewed' ? 'Results saved. They need reviewing again before the patient sees any changes.' : 'Results saved. A doctor now needs to review them.' };
}

export async function deleteLabResult(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const order = await loadOrder(fd);
  const id = num(fd, 'result_id');
  if (!order || !id) return { error: 'Result not found.' };
  await sql`DELETE FROM lab_results WHERE id = ${id} AND order_id = ${order.id}`;
  await sql`UPDATE lab_orders SET status = 'resulted', reviewed_at = NULL, reviewed_by = NULL WHERE id = ${order.id} AND status = 'reviewed'`;
  await audit(user.id, 'lab_result_deleted', 'lab_order', order.id, String(id));
  revalidateOrder(order);
  return { ok: 'Removed.' };
}

export async function uploadLabReport(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const order = await loadOrder(fd);
  if (!order || order.status === 'cancelled') return { error: 'This order can’t take a report.' };
  const file = fileFrom(fd, 'report');
  if (!file) return { error: 'Choose the report file (PDF or photo).' };
  let attachmentId: number;
  try {
    const stored = await saveUpload(file, { folder: 'lab-reports', uploadedBy: user.id, clinical: true });
    const [row] = await sql<{ id: number }>`
      INSERT INTO lab_attachments (order_id, file_id, uploaded_by) VALUES (${order.id}, ${stored.id}, ${user.id}) RETURNING id`;
    attachmentId = row.id;
    await sql`UPDATE lab_orders SET collected_at = COALESCE(collected_at, now()),
      status = CASE WHEN status = 'ordered' THEN 'collected' ELSE status END WHERE id = ${order.id}`;
    await audit(user.id, 'lab_report_uploaded', 'lab_order', order.id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidateOrder(order);
  if (str(fd, 'read') === 'on') {
    const read = await extract(attachmentId, user.id);
    if (read.error) return { error: `Report saved, but: ${read.error}` };
    return { ok: `Report saved. ${read.ok}` };
  }
  return { ok: 'Report saved. Type the results in below.' };
}

async function extract(attachmentId: number, userId: number): Promise<FormState> {
  const [att] = await sql<{ order_id: number; storage_key: string; content_type: string }>`
    SELECT a.order_id, f.storage_key, f.content_type FROM lab_attachments a JOIN files f ON f.id = a.file_id WHERE a.id = ${attachmentId}`;
  if (!att) return { error: 'Report not found.' };
  try {
    const results = await readLabReport(await readStoredFile(att.storage_key), att.content_type);
    await sql`UPDATE lab_attachments SET extracted = ${JSON.stringify(results)}::jsonb WHERE id = ${attachmentId}`;
    await audit(userId, 'lab_report_read', 'lab_order', att.order_id, `${results.length} values`);
    revalidatePath(orderPath(att.order_id));
    return { ok: `${results.length} values read from the report and filled in below. Check each one against the report, then save.` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function readLabAttachment(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireClinical();
  const id = num(fd, 'attachment_id');
  if (!id) return { error: 'Report not found.' };
  return extract(id, user.id);
}

/** Doctor sign-off: comments, and exactly which results and reports the family can see. */
export async function reviewLabOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePrescriber();
  const order = await loadOrder(fd);
  if (!order || !['resulted', 'reviewed'].includes(order.status)) return { error: 'There are no results to review yet.' };
  const shareResults = fd.getAll('share_result').map(Number).filter(Boolean);
  const shareFiles = fd.getAll('share_attachment').map(Number).filter(Boolean);
  const patientComment = str(fd, 'patient_comment');
  await transaction(async (q) => {
    await q`UPDATE lab_results SET shared_with_patient = (id = ANY(${shareResults})) WHERE order_id = ${order.id}`;
    await q`UPDATE lab_attachments SET shared_with_patient = (id = ANY(${shareFiles})) WHERE order_id = ${order.id}`;
    await q`UPDATE lab_orders SET status = 'reviewed', reviewed_at = now(), reviewed_by = ${user.id},
      review_comment = ${str(fd, 'review_comment')}, patient_comment = ${patientComment} WHERE id = ${order.id}`;
  });
  await audit(user.id, 'lab_reviewed', 'lab_order', order.id, `shared ${shareResults.length} results, ${shareFiles.length} reports`);
  revalidateOrder(order);
  revalidatePath('/portal');
  const shared = shareResults.length + shareFiles.length;
  return { ok: shared ? `Reviewed. ${shared} item${shared === 1 ? '' : 's'} now visible in the patient portal.` : 'Reviewed. Nothing shared with the patient.' };
}
