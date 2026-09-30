import { NextRequest, NextResponse } from 'next/server';
import { sendDueAppointmentReminders, sendMorningDigest } from '@/lib/appointment-reminders';

/**
 * Appointment reminders. Protected by CRON_SECRET (same as the other cron
 * routes). Call it every 10 minutes (any scheduler) for the ~1-hour
 * reminders; `?digest=1` also sends the morning "your appointments today"
 * emails (Vercel Cron does this at 7 am Lagos on working days).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const key = request.nextUrl.searchParams.get('key');
  const secret = process.env.CRON_SECRET;
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const reminders = await sendDueAppointmentReminders();
  const digests = request.nextUrl.searchParams.get('digest') === '1' ? await sendMorningDigest() : 0;
  return NextResponse.json({ ok: true, remindersSent: reminders, digestsSent: digests });
}
