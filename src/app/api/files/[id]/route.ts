import { NextRequest, NextResponse } from 'next/server';
import { can, isClinical } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getFileRecord, readStoredFile } from '@/lib/files';
import { audit, getCurrentUser } from '@/lib/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const file = await getFileRecord(Number((await params).id));
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let allowed: boolean;
  if (file.clinical) {
    // Lab reports and referral replies: clinical staff, or the patient's family once a doctor shared it.
    allowed =
      isClinical(user.clinicalRole) ||
      (user.role === 'patient' &&
        (
          await sql`SELECT 1 FROM lab_attachments a JOIN lab_orders o ON o.id = a.order_id JOIN patients p ON p.id = o.patient_id
            WHERE a.file_id = ${file.id} AND a.shared_with_patient AND o.status = 'reviewed' AND p.family_id = ${user.familyId}`
        ).length > 0);
  } else {
    // Finance staff see everything else; a patient only sees files attached to their own family.
    allowed = can(user.role, 'finance') || (user.role === 'patient' && file.family_id != null && file.family_id === user.familyId);
  }
  if (!allowed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const data = await readStoredFile(file.storage_key);
  await audit(user.id, 'view_file', 'file', file.id);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': file.content_type,
      'Content-Disposition': `inline; filename="${file.file_name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
