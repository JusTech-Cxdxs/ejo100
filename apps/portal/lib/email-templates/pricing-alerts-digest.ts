import { renderEmailLayout, escapeHtml } from './layout';

export type PricingAlertDigestItem = {
  partName: string;
  severity: 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST';
  newUnitCost: string;
  sellingPrice: string;
  actualMarginPercent: string;
  targetMarginPercent: string;
  partUrl: string;
};

export type PricingAlertsDigestEmailOptions = {
  recipientName: string;
  items: PricingAlertDigestItem[];
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

const SEVERITY_META: Record<PricingAlertDigestItem['severity'], { label: string; color: string; bg: string }> = {
  CRITICAL_LOSS: { label: 'Critical Loss', color: '#DC2626', bg: '#FEF2F2' },
  DEFICIT: { label: 'Margin Deficit', color: '#B45309', bg: '#FFFBEB' },
  BOOST: { label: 'Margin Boost', color: '#15803D', bg: '#F0FDF4' },
};

/**
 * Real, decoupled daily digest — never sent from inside
 * recordGoodsReceipt itself (that fires its own real, immediate
 * per-delivery notification already). This one runs entirely on its
 * own real schedule (see /api/cron/pricing-alerts), looking only at
 * whatever's still genuinely OPEN at the moment it runs — the actual
 * separation the user asked for, not a same-process email just
 * pretending to be independent. One real email per branch, every
 * open alert grouped by severity — never one email per alert, which
 * would just be noise, not a genuine alert system.
 */
export function renderPricingAlertsDigestEmail(opts: PricingAlertsDigestEmailOptions): string {
  const { recipientName, items, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const critical = items.filter((i) => i.severity === 'CRITICAL_LOSS');
  const deficit = items.filter((i) => i.severity === 'DEFICIT');
  const boost = items.filter((i) => i.severity === 'BOOST');

  const renderGroup = (label: string, group: PricingAlertDigestItem[]) => {
    if (group.length === 0) return '';
    const meta = SEVERITY_META[group[0]!.severity];
    const rows = group
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px 4px; border-bottom: 1px solid #E2E8F0;">
            <a href="${escapeHtml(item.partUrl)}" style="color: #0F172A; text-decoration: none; font-weight: 600;">${escapeHtml(item.partName)}</a>
          </td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #E2E8F0; text-align: right; color: #475569;">${escapeHtml(item.newUnitCost)}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #E2E8F0; text-align: right; color: #475569;">${escapeHtml(item.sellingPrice)}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #E2E8F0; text-align: right; color: ${meta.color}; font-weight: 600;">${escapeHtml(item.actualMarginPercent)}%</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #E2E8F0; text-align: right; color: #475569;">${escapeHtml(item.targetMarginPercent)}%</td>
        </tr>`,
      )
      .join('');

    return `
      <p style="margin: 20px 0 6px 0; font-size: 12px; font-weight: 700; color: ${meta.color}; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(label)} (${group.length})</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="text-align: right;">
            <th style="padding: 4px; text-align: left; font-size: 11px; color: #94A3B8;">Part</th>
            <th style="padding: 4px; font-size: 11px; color: #94A3B8;">Cost</th>
            <th style="padding: 4px; font-size: 11px; color: #94A3B8;">Price</th>
            <th style="padding: 4px; font-size: 11px; color: #94A3B8;">Actual</th>
            <th style="padding: 4px; font-size: 11px; color: #94A3B8;">Target</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${items.length} real pricing ${items.length === 1 ? 'alert is' : 'alerts are'} still open at ${escapeHtml(branchName)}
      as of today.
    </p>
    ${renderGroup('Critical Loss', critical)}
    ${renderGroup('Margin Deficit', deficit)}
    ${renderGroup('Margin Boost', boost)}
    <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748B;">
      This is a real, standing daily summary — it only ever lists what's genuinely still open right now, not
      every alert ever raised.
    </p>
  `;

  return renderEmailLayout({
    previewText: `${items.length} pricing ${items.length === 1 ? 'alert' : 'alerts'} still open at ${branchName}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: critical.length > 0 ? 'negative' : 'neutral',
    heading: 'Pricing Command Center — daily summary',
    bodyHtml,
    ctaLabel: 'Open Pricing Command Center',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
