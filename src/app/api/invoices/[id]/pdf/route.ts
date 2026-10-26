import { NextRequest, NextResponse } from 'next/server';
import { can } from '@/lib/auth';
import { getInvoice } from '@/lib/billing';
import { renderInvoicePdf } from '@/lib/pdf/render';
import { getCurrentUser } from '@/lib/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const id = Number((await params).id);
  const invoice = await getInvoice(id);
  // Patients only ever see their own family's issued invoices.
  const allowed =
    !!invoice && (can(user.role, 'finance') || (user.role === 'patient' && invoice.family_id === user.familyId && invoice.status !== 'draft'));
  if (!allowed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const pdf = await renderInvoicePdf(id);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdf.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[invoice pdf]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not generate PDF.' }, { status: 500 });
  }
}
