import { renderEmailLayout, escapeHtml } from './layout';

export type PartTargetMarginSetEmailOptions = {
  recipientName: string;
  setByName: string;
  partName: string;
  previousTargetMarginPercent: number | null;
  newTargetMarginPercent: number;
  newTargetMarkupPercent: number;
  enteredAs: 'MARGIN' | 'MARKUP';
  enteredValue: number;
  partUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

function formatPercent(value: number | null): string {
  return value !== null ? `${value.toFixed(1)}%` : '—';
}

/**
 * Fires on every genuine Target Margin/Markup change — the same real
 * standard already applied to a selling-price change, since setting
 * the target is just as real a pricing decision: it's the exact
 * number every future Pricing Alert on this Part gets compared
 * against. Shows both real units (Margin and Markup) together,
 * always, the same standing rule as everywhere else in this system —
 * never just the one number that was actually typed in.
 */
export function renderPartTargetMarginSetEmail(opts: PartTargetMarginSetEmailOptions): string {
  const {
    recipientName, setByName, partName, previousTargetMarginPercent, newTargetMarginPercent,
    newTargetMarkupPercent, enteredAs, enteredValue, partUrl, logoUrl, companyName, branchName,
  } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(setByName)} set a new Target ${enteredAs === 'MARGIN' ? 'Margin' : 'Markup'} on
      <strong>${escapeHtml(partName)}</strong> — entered as ${enteredValue.toFixed(1)}%.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em;">Target Pricing</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
            ${previousTargetMarginPercent !== null ? `<tr><td style="padding: 3px 0; color: #64748B;">Previous Target Margin</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(formatPercent(previousTargetMarginPercent))}</td></tr>` : ''}
            <tr><td style="padding: 3px 0; color: #64748B;">New Target Margin</td><td style="padding: 3px 0; text-align: right; color: #0F172A; font-weight: 700;">${escapeHtml(formatPercent(newTargetMarginPercent))}</td></tr>
            <tr><td style="padding: 3px 0; color: #64748B;">Equivalent Target Markup</td><td style="padding: 3px 0; text-align: right; color: #0F172A;">${escapeHtml(formatPercent(newTargetMarkupPercent))}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748B;">
      Margin — profit compared with selling price. Markup — profit compared with cost. Same real profit, two
      real ways to measure it. Every real Goods Receipt on this Part from now on is compared against this new
      target.
    </p>
  `;

  return renderEmailLayout({
    previewText: `${partName}'s Target Margin is now ${formatPercent(newTargetMarginPercent)}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'neutral',
    heading: `Target Pricing updated — ${partName}`,
    bodyHtml,
    ctaLabel: 'View Part',
    ctaUrl: partUrl,
    logoUrl,
  });
}
