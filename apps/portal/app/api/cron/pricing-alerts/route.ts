import { NextRequest, NextResponse } from 'next/server';
import { getOpenPricingAlertsForDigest } from '@/lib/actions/store';
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
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const groups = await getOpenPricingAlertsForDigest();
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  const logoUrl = `${portalUrl}/images/logo/logo.png`;

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
          `Pricing Command Center — ${group.items.length} open ${group.items.length === 1 ? 'alert' : 'alerts'} at ${group.branchName}`,
          html,
        );
        emailsSent += 1;
      } catch (err) {
        emailsFailed += 1;
        // eslint-disable-next-line no-console
        console.error('Failed to send pricing-alerts digest', group.branchId, recipient.email, err);
      }
    }
  }

  return NextResponse.json({
    branchesWithOpenAlerts: groups.length,
    emailsSent,
    emailsFailed,
  });
}
