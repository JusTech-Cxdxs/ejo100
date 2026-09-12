import { renderEmailLayout, escapeHtml } from './layout';

export type PartSellingPriceSetEmailOptions = {
  recipientName: string;
  setByName: string;
  partName: string;
  baseUnitOfMeasure: string;
  previousSellingPrice: number | null;
  newSellingPrice: number;
  margin: {
    quantityInBaseUnit: number;
    totalBulkCost: number;
    expectedRevenue: number;
    grossProfit: number;
    markupPercent: number | null;
    marginPercent: number | null;
  } | null;
  targetMarginPercent: number | null;
  partUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null): string {
  return value !== null ? `${value.toFixed(1)}%` : '—';
}

/**
 * Deliberately sent to every real Store Officer/Manager at the
 * branch, not just logged quietly — a selling price is a genuine
 * pricing decision with real margin and markup attached, and the
 * whole team should see exactly what changed, what it now means, and
 * whether it still holds against this Part's own real Target Margin
 * — never just one unlabeled percentage.
 */
export function renderPartSellingPriceSetEmail(opts: PartSellingPriceSetEmailOptions): string {
  const { recipientName, setByName, partName, baseUnitOfMeasure, previousSellingPrice, newSellingPrice, margin, targetMarginPercent, partUrl, logoUrl, companyName, branchName, departmentName } = opts;

  // A real, honest severity read on the change itself — below target
  // is flagged, at or above target reads as a normal confirmation.
  // Never assumes a deficit just because no target is set yet.
  const isBelowTarget = targetMarginPercent !== null && margin?.marginPercent !== null && margin?.marginPercent !== undefined && margin.marginPercent < targetMarginPercent;
  const accentColor = isBelowTarget ? '#B45309' : '#15803D';
  const accentBg = isBelowTarget ? '#FFFBEB' : '#F0FDF4';

  const changeLine =
    previousSellingPrice === null
      ? `set the Selling Price for ${escapeHtml(partName)} to ${formatNaira(newSellingPrice)} per ${escapeHtml(baseUnitOfMeasure)}`
      : `changed the Selling Price for ${escapeHtml(partName)} from ${formatNaira(previousSellingPrice)} to ${formatNaira(newSellingPrice)} per ${escapeHtml(baseUnitOfMeasure)}`;

  const insightBox = margin
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: ${accentBg}; border: 1px solid ${accentColor}33; border-radius: 12px;">
      <tr>
        <td style="padding: 18px 22px;">
          <p style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: ${accentColor}; font-weight: 700;">
            Profitability &amp; Pricing Insight ${isBelowTarget ? '— below target' : ''}
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
            <tr><td style="padding: 3px 0; color: #64748B;">Total Bulk Cost</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${formatNaira(margin.totalBulkCost)}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Expected Revenue</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${formatNaira(margin.expectedRevenue)}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Expected Gross Profit</td><td style="padding: 3px 0; text-align: right; color: #0F172A; font-weight: 600;">${formatNaira(margin.grossProfit)}</td></tr>
            <tr><td style="padding: 8px 0 3px 0; color: #64748B; border-top: 1px solid ${accentColor}33;">Current Margin (of Price)</td><td style="padding: 8px 0 3px 0; text-align: right; color: ${accentColor}; font-weight: 700; border-top: 1px solid ${accentColor}33;">${escapeHtml(formatPercent(margin.marginPercent))}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Current Markup (of Cost)</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(formatPercent(margin.markupPercent))}</td></tr>
            ${targetMarginPercent !== null ? `<tr><td style="padding: 3px 0; color: #64748B;">Target Margin</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(formatPercent(targetMarginPercent))}</td></tr>` : ''}
          </table>
          <p style="margin: 10px 0 0 0; font-size: 11px; color: #64748B;">
            Margin — profit compared with selling price. Markup — profit compared with cost. Same real profit,
            two real ways to measure it. Figures above are a real projection using the current selling price and
            the most recent delivery cost — not actual historical revenue.
          </p>
        </td>
      </tr>
    </table>
  `
    : '';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(setByName)} ${changeLine}.
    </p>
    ${insightBox}
  `;

  return renderEmailLayout({
    previewText: `${setByName} ${changeLine}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '\u20a6',
    iconTone: isBelowTarget ? 'neutral' : 'positive',
    heading: 'Selling price updated',
    bodyHtml,
    ctaLabel: 'View Part',
    ctaUrl: partUrl,
    logoUrl,
  });
}
