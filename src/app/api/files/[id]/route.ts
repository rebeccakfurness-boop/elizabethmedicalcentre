import { NextRequest, NextResponse } from 'next/server';
import { can } from '@/lib/auth';
import { getFileRecord, readStoredFile } from '@/lib/files';
import { audit, getCurrentUser } from '@/lib/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const file = await getFileRecord(Number((await params).id));
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Finance staff see everything; a patient only sees files attached to their own family.
  const allowed = can(user.role, 'finance') || (user.role === 'patient' && file.family_id != null && file.family_id === user.familyId);
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
