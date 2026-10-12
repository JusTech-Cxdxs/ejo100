import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import { setAuditActor } from '@ejo/database';
import { recordJobRun } from '@/lib/job-runs';
import { purgeOldErrorEvents } from '@/lib/error-events';
import { getOpenPricingAlertsForDigest } from '@/lib/pricing-digest';
import { sendEmail } from '@/lib/email';
import { renderPricingAlertsDigestEmail } from '@/lib/email-templates/pricing-alerts-digest';

/**
 * The real, decoupled "microservice" piece of the Pricing Command
 * Center — genuinely separate from the synchronous recordGoodsReceipt
 * flow, which already sends its own real, immediate per-delivery
 * notification. This route runs entirely on its own independent
 * schedule (see vercel.json's own `crons` entry), looking only at
 * whatever pricing alerts are genuinely still OPEN the moment it
 * runs — never a queue of "unsent" alerts that could double-send or
 * silently drop one, since it has no memory between runs at all, by
 * design. One real digest email per branch, per real eligible
 * recipient — never one email per alert.
 *
 * Authenticated the standard, documented Vercel Cron way: Vercel
 * itself sends a real `Authorization: Bearer <CRON_SECRET>` header on
 * every real scheduled invocation, checked against the same secret
 * set in this project's own environment variables. Nothing else can
 * trigger a real send by hitting this URL directly without knowing
 * that secret.
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
        // Rendered once per real recipient, not once per branch with
        // a name spliced in afterward — a genuine per-person greeting
        // every time, never a fragile string-replace that could
        // silently leave a broken email if this template's own
        // wording ever changes later.
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
  return NextResponse.json({
    branchesWithOpenAlerts: groups.length,
    emailsSent,
    emailsFailed,
  });
}
