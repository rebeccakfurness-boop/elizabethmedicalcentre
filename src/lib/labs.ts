import 'server-only';
import { query, sql } from '@/lib/db';
import type { Flag } from '@/clinical/labs';
import { LAB_TESTS_BY_CODE } from '@/clinical/labs';

export type LabStatus = 'ordered' | 'collected' | 'resulted' | 'reviewed' | 'cancelled';

export const LAB_STATUS_LABELS: Record<LabStatus, string> = {
  ordered: 'Ordered',
  collected: 'Sample taken',
  resulted: 'Results in: to review',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
};

export interface LabOrderRow {
  id: number;
  patient_id: number;
  family_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  sex: 'male' | 'female' | 'other' | null;
  date_of_birth: string | null;
  encounter_id: number | null;
  ordered_by: number;
  ordered_by_name: string;
  test_codes: string[];
  other_tests: string | null;
  lab_name: string | null;
  urgency: 'routine' | 'urgent';
  fasting: boolean;
  clinical_details: string | null;
  status: LabStatus;
  collected_at: string | null;
  resulted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_comment: string | null;
  patient_comment: string | null;
  created_at: string;
  abnormal_count: number;
  critical_count: number;
  result_count: number;
}

export interface LabResultRow {
  id: number;
  order_id: number;
  test_code: string | null;
  analyte_code: string | null;
  name: string;
  value: string;
  numeric_value: string | null;
  unit: string | null;
  ref_range: string | null;
  flag: Flag;
  shared_with_patient: boolean;
  entered_by_name: string;
  entered_at: string;
}

export interface LabAttachmentRow {
  id: number;
  order_id: number;
  file_id: number;
  file_name: string;
  content_type: string;
  shared_with_patient: boolean;
  extracted: ExtractedResult[] | null;
  created_at: string;
}

export interface ExtractedResult {
  analyteCode: string | null;
  name: string;
  value: string;
  unit: string | null;
  refRange: string | null;
}

const ORDER_SELECT = `
  SELECT o.*, p.family_id, p.first_name, p.last_name, p.mrn, p.sex, p.date_of_birth,
    u.name AS ordered_by_name, r.name AS reviewed_by_name,
    (SELECT COUNT(*)::int FROM lab_results x WHERE x.order_id = o.id AND x.flag IS NOT NULL) AS abnormal_count,
    (SELECT COUNT(*)::int FROM lab_results x WHERE x.order_id = o.id AND x.flag IN ('LL', 'HH')) AS critical_count,
    (SELECT COUNT(*)::int FROM lab_results x WHERE x.order_id = o.id) AS result_count
  FROM lab_orders o
  JOIN patients p ON p.id = o.patient_id
  JOIN users u ON u.id = o.ordered_by
  LEFT JOIN users r ON r.id = o.reviewed_by`;

export function testNames(order: Pick<LabOrderRow, 'test_codes' | 'other_tests'>): string {
  const names = order.test_codes.map((c) => LAB_TESTS_BY_CODE.get(c)?.name ?? c);
  if (order.other_tests) names.push(order.other_tests);
  return names.join(', ');
}

export async function getLabOrder(id: number): Promise<LabOrderRow | null> {
  return (await query<LabOrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [id]))[0] ?? null;
}

export async function getLabInbox(): Promise<{ toReview: LabOrderRow[]; awaiting: LabOrderRow[]; recent: LabOrderRow[] }> {
  const [toReview, awaiting, recent] = await Promise.all([
    query<LabOrderRow>(`${ORDER_SELECT} WHERE o.status = 'resulted' ORDER BY o.resulted_at`),
    query<LabOrderRow>(`${ORDER_SELECT} WHERE o.status IN ('ordered', 'collected') ORDER BY o.urgency DESC, o.created_at`),
    query<LabOrderRow>(`${ORDER_SELECT} WHERE o.status = 'reviewed' ORDER BY o.reviewed_at DESC LIMIT 30`),
  ]);
  // Critical results first, then abnormal, then oldest.
  toReview.sort((a, b) => b.critical_count - a.critical_count || b.abnormal_count - a.abnormal_count);
  return { toReview, awaiting, recent };
}

export async function getPatientLabOrders(patientId: number): Promise<LabOrderRow[]> {
  return query<LabOrderRow>(`${ORDER_SELECT} WHERE o.patient_id = $1 ORDER BY o.created_at DESC`, [patientId]);
}

export async function getEncounterLabOrders(encounterId: number): Promise<LabOrderRow[]> {
  return query<LabOrderRow>(`${ORDER_SELECT} WHERE o.encounter_id = $1 ORDER BY o.created_at`, [encounterId]);
}

export async function getLabResults(orderIds: number[]): Promise<LabResultRow[]> {
  if (!orderIds.length) return [];
  return sql<LabResultRow>`
    SELECT r.*, u.name AS entered_by_name FROM lab_results r JOIN users u ON u.id = r.entered_by
    WHERE r.order_id = ANY(${orderIds}) ORDER BY r.order_id, r.sort_order, r.id`;
}

export async function getLabAttachments(orderIds: number[]): Promise<LabAttachmentRow[]> {
  if (!orderIds.length) return [];
  return sql<LabAttachmentRow>`
    SELECT a.*, f.file_name, f.content_type FROM lab_attachments a JOIN files f ON f.id = a.file_id
    WHERE a.order_id = ANY(${orderIds}) ORDER BY a.created_at`;
}

/** Earlier values of the same analytes for this patient, newest first, to show trends. */
export async function getPreviousValues(patientId: number, beforeOrderId: number): Promise<Map<string, { value: string; flag: Flag; date: string }[]>> {
  const rows = await sql<{ analyte_code: string; value: string; flag: Flag; date: string }>`
    SELECT r.analyte_code, r.value, r.flag, COALESCE(o.collected_at, o.created_at) AS date
    FROM lab_results r JOIN lab_orders o ON o.id = r.order_id
    WHERE o.patient_id = ${patientId} AND o.id <> ${beforeOrderId} AND o.status <> 'cancelled' AND r.analyte_code IS NOT NULL
      AND o.created_at <= (SELECT created_at FROM lab_orders WHERE id = ${beforeOrderId})
    ORDER BY date DESC`;
  const map = new Map<string, { value: string; flag: Flag; date: string }[]>();
  for (const r of rows) {
    const list = map.get(r.analyte_code) ?? [];
    if (list.length < 3) list.push({ value: r.value, flag: r.flag, date: r.date });
    map.set(r.analyte_code, list);
  }
  return map;
}

/** What a family may see: shared results from reviewed orders only. */
export async function getPortalLabResults(familyId: number) {
  const orders = await query<LabOrderRow>(
    `${ORDER_SELECT} WHERE p.family_id = $1 AND o.status = 'reviewed'
       AND (EXISTS (SELECT 1 FROM lab_results r WHERE r.order_id = o.id AND r.shared_with_patient)
         OR EXISTS (SELECT 1 FROM lab_attachments a WHERE a.order_id = o.id AND a.shared_with_patient))
     ORDER BY o.reviewed_at DESC LIMIT 50`,
    [familyId]
  );
  const ids = orders.map((o) => o.id);
  const [results, attachments] = await Promise.all([getLabResults(ids), getLabAttachments(ids)]);
  return {
    orders,
    results: results.filter((r) => r.shared_with_patient),
    attachments: attachments.filter((a) => a.shared_with_patient),
  };
}

export async function countLabsToReview(): Promise<{ to_review: number; critical: number }> {
  const [row] = await sql<{ to_review: number; critical: number }>`
    SELECT COUNT(*)::int AS to_review,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lab_results r WHERE r.order_id = o.id AND r.flag IN ('LL', 'HH')))::int AS critical
    FROM lab_orders o WHERE o.status = 'resulted'`;
  return row;
}
