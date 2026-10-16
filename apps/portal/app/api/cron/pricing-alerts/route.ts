import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import { setAuditActor } from '@ejo/database';
import { recordJobRun } from '@/lib/job-runs';
import { purgeOldErrorEvents } from '@/lib/error-events';
import { purgeExpiredOnSchedule } from '@/lib/recycle-bin/server';
import { purgeOldEnyoConversations } from '@/lib/enyo/retention';
import { getOpenPricingAlertsForDigest } from '@/lib/pricing-digest';
import { sendEmail } from '@/lib/email';
import { renderPricingAlertsDigestEmail } from '@/lib/email-templates/pricing-alerts-digest';
import { purgeOldMailMessages } from '@/lib/mail/sync';
import { purgeOldReminders } from '@/lib/reminders';
import { resolveDurations } from '@/lib/enyo/ml/models';
import { harvestPublicConversations } from '@/lib/enyo/conversations';
import { prisma } from '@ejo/database';

/**
 * Pricing alert digest (scheduled in vercel.json). Reads the alerts that are
 * OPEN at run time and sends one digest per branch per eligible recipient.
 * It keeps no state between runs, so nothing can be sent twice or skipped.
 * Goods receipts send their own immediate notification separately.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends.
 */
export async function GET(request: NextRequest) {
  // Scheduled job: any write it makes is journaled as the system.
  setAuditActor(null, 'cron:pricing-alerts');
  const authHeader = request.headers.get('authorization');
  if (!isCronRequest(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const groups = await getOpenPricingAlertsForDigest();
  const portalUrl = portalBaseUrl();
  const logoUrl = `${portalUrl}/images/logo/email-logo.png`;

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const group of groups) {
    const digestItems = group.items.map((item) => ({
      partName: item.partName,
      severity: item.severity,
      newUnitCost: `₦${item.newUnitCost.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${item.baseUnitOfMeasure}`,
      sellingPrice: `₦${item.sellingPriceAtAlert.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/${item.baseUnitOfMeasure}`,
      actualMarginPercent: item.actualMarginPercent.toFixed(1),
      targetMarginPercent: item.targetMarginPercentAtAlert.toFixed(1),
      partUrl: `${portalUrl}/inventory/parts/${item.partId}`,
    }));

    for (const recipient of group.recipients) {
      try {
        // Rendered per recipient so the greeting uses their name.
        const html = renderPricingAlertsDigestEmail({
          recipientName: recipient.fullName,
          items: digestItems,
          dashboardUrl: `${portalUrl}/inventory/pricing?branchId=${group.branchId}`,
          logoUrl,
          companyName: group.companyName,
          branchName: group.branchName,
        });
        await sendEmail(
          recipient.email,
          `${group.items.length} open pricing ${group.items.length === 1 ? 'alert' : 'alerts'} at ${group.branchName}`,
          html,
        );
        emailsSent += 1;
      } catch (err) {
        emailsFailed += 1;
        // eslint-disable-next-line no-console
        logFailure('Failed to send pricing-alerts digest', group.branchId, recipient.email, err);
      }
    }
  }

  await recordJobRun('pricing-alerts', { branchesWithOpenAlerts: groups.length, emailsSent, emailsFailed });
  // Error references are kept for 90 days (data inventory: ErrorEvent).
  const purged = await purgeOldErrorEvents(90).catch((err) => { logFailure('Error log clean-up failed', err); return null; });
  if (purged !== null) await recordJobRun('error-log-cleanup', { errorReferencesRemoved: purged });
  // Recycle bin items past their restore period (data inventory: RecycleBinItem).
  const binned = await purgeExpiredOnSchedule().catch((err) => { logFailure('Recycle bin clean-up failed', err); return null; });
  if (binned !== null) await recordJobRun('recycle-bin-purge', { itemsRemoved: binned });
  // Enyo chats: staff and customer 12 months, public website 90 days (data inventory: EnyoConversation).
  const chats = await purgeOldEnyoConversations().catch((err) => { logFailure('Enyo conversation clean-up failed', err); return null; });
  if (chats !== null) await recordJobRun('enyo-cleanup', { conversationsRemoved: chats.staffAndCustomer + chats.publicChats, staffAndCustomer: chats.staffAndCustomer, publicChats: chats.publicChats });
  // Stored copies of connected mailboxes are kept 90 days (data inventory: MailMessage).
  const mailPurged = await purgeOldMailMessages().catch((err) => { logFailure('Mail clean-up failed', err); return null; });
  if (mailPurged !== null) await recordJobRun('mail-retention', { messagesRemoved: mailPurged });
  // Done and cancelled reminders are kept 12 months (data inventory: Reminder).
  const remindersPurged = await purgeOldReminders().catch((err) => { logFailure('Reminder clean-up failed', err); return null; });
  if (remindersPurged !== null) await recordJobRun('reminder-retention', { remindersRemoved: remindersPurged });

  // Enyo: score yesterday's job time estimates against when the vehicles were actually ready.
  const durations = await resolveDurations().catch((err) => { logFailure('Enyo job time scoring failed', err); return null; });
  if (durations !== null) await recordJobRun('enyo-duration-scoring', { estimatesScored: durations });

  // Enyo: yesterday's customer and website chats → answers waiting for approval (Enyo learning page).
  let harvested = 0;
  try {
    const orgs = await prisma.organisation.findMany({ where: { isActive: true }, select: { id: true }, take: 50 });
    for (const o of orgs) harvested += await harvestPublicConversations(o.id).catch((err) => { logFailure('Enyo chat learning failed', err); return 0; });
    await recordJobRun('enyo-chat-learning', { candidates: harvested });
  } catch (err) {
    logFailure('Enyo chat learning failed', err);
  }
  return NextResponse.json({
    branchesWithOpenAlerts: groups.length,
    emailsSent,
    emailsFailed,
  });
}
