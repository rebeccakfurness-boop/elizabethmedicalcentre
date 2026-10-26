import { NextRequest, NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/email';

// Called once a day by Vercel Cron (vercel.json). If CRON_SECRET is set, Vercel sends it as a
// bearer token and anything else is refused. Each booking is only ever reminded once, so an extra
// call can't spam anyone.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  }
  try {
    const result = await sendDueReminders();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron reminders]', err);
    return NextResponse.json({ error: 'Failed.' }, { status: 500 });
  }
}
