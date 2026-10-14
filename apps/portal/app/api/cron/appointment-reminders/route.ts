import { logFailure } from '@/lib/log';
import { NextRequest, NextResponse } from 'next/server';
import { sendDueAppointmentReminders, sendMorningDigest } from '@/lib/appointment-reminders';
import { deliverDueBroadcastEmails } from '@/lib/broadcast-delivery';
import { recordJobRun } from '@/lib/job-runs';
import { setAuditActor } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { deliverRoleAccessNotices } from '@/lib/access-notices';
import { deliverDueReminders } from '@/lib/reminders';
import { syncDueMailboxes } from '@/lib/mail/sync';
import { mailFeatureReady } from '@/lib/mail/config';

// Room for a batch of access-changed emails (a role with many holders).
export const maxDuration = 60;

/**
 * Appointment reminders. Protected by CRON_SECRET (same as the other cron
 * routes). Call it every 10 minutes (any scheduler) for the ~1-hour
 * reminders; `?digest=1` also sends the morning "your appointments today"
 * emails (Vercel Cron does this at 7 am Lagos on working days).
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setAuditActor(null, 'cron:appointment-reminders');
  const started = Date.now();
  const reminders = await sendDueAppointmentReminders();
  // Scheduled broadcasts go out by email at their start time.
  const broadcastEmails = await deliverDueBroadcastEmails();
  const digest = request.nextUrl.searchParams.get('digest') === '1';
  const digests = digest ? await sendMorningDigest() : 0;
  await recordJobRun('appointment-reminders', { remindersSent: reminders, broadcastEmailsSent: broadcastEmails });
  // Role permission changes since the last run → one access-changed email per holder.
  const notices = await deliverRoleAccessNotices().catch((err) => { logFailure('Access notices failed', err); return null; });
  if (notices) await recordJobRun('access-notices', { rolesChanged: notices.roles, upTo: notices.upTo });
  if (digest) await recordJobRun('morning-digest', { digestsSent: digests });
  // Personal reminders that are due: into the person's bell, and by email when they asked.
  const personal = await deliverDueReminders().catch((err) => { logFailure('Reminder delivery failed', err); return null; });
  if (personal) await recordJobRun('reminders', { remindersDelivered: personal.delivered, remindersEmailed: personal.emailed });
  // Connected work mailboxes of people active this week: new mail, within what is left of the run.
  const left = 50_000 - (Date.now() - started);
  if (mailFeatureReady() && left > 8_000) {
    const mail = await syncDueMailboxes({ budgetMs: Math.min(30_000, left - 3_000) }).catch((err) => { logFailure('Mailbox sync job failed', err); return null; });
    if (mail) await recordJobRun('mail-sync', { mailboxesSynced: mail.synced, mailboxesFailed: mail.failed, mailboxesSkipped: mail.skipped, messagesAdded: mail.added });
  }
  return NextResponse.json({ ok: true, remindersSent: reminders, digestsSent: digests, broadcastEmailsSent: broadcastEmails, personalRemindersDelivered: personal?.delivered ?? 0 });
}
