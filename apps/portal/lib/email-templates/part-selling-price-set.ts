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
  } | null;
  partUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Deliberately sent to every real Store Officer/Manager at the
 * branch, not just logged quietly — a selling price is a genuine
 * pricing decision with a real margin attached, and the whole team
 * should see exactly what changed and what it means, the same
 * reasoning already applied to Goods Receipt edits.
 */
export function renderPartSellingPriceSetEmail(opts: PartSellingPriceSetEmailOptions): string {
  const { recipientName, setByName, partName, baseUnitOfMeasure, previousSellingPrice, newSellingPrice, margin, partUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const changeLine =
    previousSellingPrice === null
      ? `set the Selling Price for ${escapeHtml(partName)} to ${formatNaira(newSellingPrice)} per ${escapeHtml(baseUnitOfMeasure)}`
      : `changed the Selling Price for ${escapeHtml(partName)} from ${formatNaira(previousSellingPrice)} to ${formatNaira(newSellingPrice)} per ${escapeHtml(baseUnitOfMeasure)}`;

  const marginRows = margin
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Live Margin Insight — based on the most recent delivery</p>
          <p style="margin: 0 0 6px 0; font-size: 15px; color: #0F172A;">Total Bulk Cost: <strong>${formatNaira(margin.totalBulkCost)}</strong></p>
          <p style="margin: 0 0 6px 0; font-size: 15px; color: #0F172A;">Expected Revenue: <strong>${formatNaira(margin.expectedRevenue)}</strong></p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">Gross Profit: <strong>${formatNaira(margin.grossProfit)}</strong>${margin.markupPercent !== null ? ` (${margin.markupPercent.toFixed(1)}% Markup)` : ''}</p>
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
    ${marginRows}
  `;

  return renderEmailLayout({
    previewText: `${setByName} ${changeLine}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '\u20a6',
    iconTone: 'positive',
    heading: 'Selling price updated',
    bodyHtml,
    ctaLabel: 'View Part',
    ctaUrl: partUrl,
    logoUrl,
  });
}
