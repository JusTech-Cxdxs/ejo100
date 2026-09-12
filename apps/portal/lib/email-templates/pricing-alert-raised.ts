import { renderEmailLayout, escapeHtml } from './layout';

export type PricingAlertRaisedEmailOptions = {
  recipientName: string;
  partName: string;
  severity: 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST';
  goodsReceiptReference: string;
  previousUnitCost: string | null;
  newUnitCost: string;
  sellingPrice: string;
  actualMarginPercent: string;
  targetMarginPercent: string;
  recommendedPrice: string | null;
  recommendedMarkupPercent: string | null;
  alertUrl: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

const SEVERITY_META: Record<
  PricingAlertRaisedEmailOptions['severity'],
  { label: string; color: string; bg: string; badgeGlyph: string; inlineIcon: string; tone: 'positive' | 'negative' | 'neutral'; guidance: string }
> = {
  CRITICAL_LOSS: {
    label: 'Critical Loss',
    color: '#DC2626',
    bg: '#FEF2F2',
    // The styled icon badge uses the same simple, universally-safe
    // characters already proven across every other real email in this
    // system (✓ / !) — a full color emoji here risks showing as a
    // broken glyph box in plenty of real email clients. The emoji
    // below is only ever inline body text next to a label, never
    // inside the styled badge itself, which is the much lower-risk
    // real use of it.
    badgeGlyph: '!',
    inlineIcon: '⛔',
    tone: 'negative',
    guidance:
      'Every real sale of this Part at its current price is a genuine loss right now. This Part has already been blocked from being matched onto any new customer estimate. The real fix: open the dashboard and either Sync Price to restore the real target margin, or set a new price by hand if the target itself needs a second look.',
  },
  DEFICIT: {
    label: 'Margin Deficit',
    color: '#B45309',
    bg: '#FFFBEB',
    badgeGlyph: '!',
    inlineIcon: '⚠',
    tone: 'neutral',
    guidance:
      'Margin has genuinely fallen below what Store wants to hold on this Part — still a real profit, just a thinner one than intended. Worth a real look: Sync Price on the dashboard to restore the target margin, or Dismiss with a real reason if the current price is fine as it stands.',
  },
  BOOST: {
    label: 'Margin Boost',
    color: '#15803D',
    bg: '#F0FDF4',
    badgeGlyph: '✓',
    inlineIcon: '↑',
    tone: 'positive',
    guidance:
      'Cost has genuinely dropped on this delivery — margin is now comfortably above target. A real opportunity, not a problem to fix — Store can hold the extra margin as-is, or choose to Sync Price down to pass some of it on. Never assume a lower price is automatically the right call here; that is a real, deliberate business decision.',
  },
};

/**
 * Fires once, immediately, the moment a real Goods Receipt line
 * raises a genuinely new Pricing Alert — a real, separate email from
 * the Goods Receipt's own delivery-confirmation notification, since
 * they're two different real things: one confirms a delivery
 * happened, this one flags a real pricing situation that needs a
 * human decision. Distinct from the daily digest cron, which only
 * ever summarizes whatever's still open once a day — this is the
 * real, immediate first notice.
 */
export function renderPricingAlertRaisedEmail(opts: PricingAlertRaisedEmailOptions): string {
  const {
    recipientName, partName, severity, goodsReceiptReference, previousUnitCost, newUnitCost,
    sellingPrice, actualMarginPercent, targetMarginPercent, recommendedPrice, recommendedMarkupPercent,
    alertUrl, dashboardUrl, logoUrl, companyName, branchName,
  } = opts;
  const meta = SEVERITY_META[severity];

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Recording ${escapeHtml(goodsReceiptReference)} just raised a real ${escapeHtml(meta.label)} alert on
      <strong>${escapeHtml(partName)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: ${meta.bg}; border: 1px solid ${meta.color}33; border-radius: 10px;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: ${meta.color};">${meta.inlineIcon} ${escapeHtml(meta.label)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
            ${previousUnitCost ? `<tr><td style="padding: 3px 0; color: #64748B;">Previous Cost</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(previousUnitCost)}</td></tr>` : ''}
            <tr><td style="padding: 3px 0; color: #64748B;">New Cost</td><td style="padding: 3px 0; text-align: right; color: #0F172A; font-weight: 600;">${escapeHtml(newUnitCost)}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Selling Price</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(sellingPrice)}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Actual Margin</td><td style="padding: 3px 0; text-align: right; color: ${meta.color}; font-weight: 700;">${escapeHtml(actualMarginPercent)}%</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Target Margin</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(targetMarginPercent)}%</td></tr>
            ${recommendedPrice ? `<tr><td style="padding: 3px 0; color: #64748B;">Recommended Price</td><td style="padding: 3px 0; text-align: right; color: #0F172A; font-weight: 600;">${escapeHtml(recommendedPrice)}</td></tr>` : ''}
            ${recommendedMarkupPercent ? `<tr><td style="padding: 3px 0; color: #64748B;">Recommended Markup</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(recommendedMarkupPercent)}%</td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 13px; color: #334155;">${meta.guidance}</p>
  `;

  return renderEmailLayout({
    previewText: `${meta.label}: ${partName} needs a real pricing decision.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: meta.badgeGlyph,
    iconTone: meta.tone,
    heading: `${meta.label} — ${partName}`,
    bodyHtml,
    ctaLabel: 'Open Pricing Command Center',
    ctaUrl: alertUrl || dashboardUrl,
    logoUrl,
  });
}
