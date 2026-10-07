import { NextRequest, NextResponse } from 'next/server';
import { sendDueAppointmentReminders, sendMorningDigest } from '@/lib/appointment-reminders';
import { deliverDueBroadcastEmails } from '@/lib/broadcast-delivery';
import { recordJobRun } from '@/lib/job-runs';
import { setAuditActor } from '@ejo/database';
import { deliverRoleAccessNotices } from '@/lib/access-notices';

// Room for a batch of access-changed emails (a role with many holders).
export const maxDuration = 60;

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
  setAuditActor(null, 'cron:appointment-reminders');
  const reminders = await sendDueAppointmentReminders();
  // Scheduled broadcasts go out by email at their start time.
  const broadcastEmails = await deliverDueBroadcastEmails();
  const digest = request.nextUrl.searchParams.get('digest') === '1';
  const digests = digest ? await sendMorningDigest() : 0;
  await recordJobRun('appointment-reminders', { remindersSent: reminders, broadcastEmailsSent: broadcastEmails });
  // Role permission changes since the last run → one access-changed email per holder.
  const notices = await deliverRoleAccessNotices().catch((err) => { console.error('Access notices failed', err); return null; });
  if (notices) await recordJobRun('access-notices', { rolesChanged: notices.roles, upTo: notices.upTo });
  if (digest) await recordJobRun('morning-digest', { digestsSent: digests });
  return NextResponse.json({ ok: true, remindersSent: reminders, digestsSent: digests, broadcastEmailsSent: broadcastEmails });
}
