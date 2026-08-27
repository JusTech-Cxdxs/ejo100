import { renderEmailLayout, escapeHtml } from './layout';

export type PaymentCompletedInFullEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  totalPaid: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent exactly once — the moment the cumulative recorded total first
 * reaches the full estimate — to every real party on the Job Card,
 * same recipient set as payment-requirement-met.ts. A genuinely
 * separate milestone from the 70% deposit: if a single payment
 * happens to cross both thresholds at once (a customer paying in
 * full straight away), only this one is sent, not both — this is
 * strictly the more complete, final fact, so the intermediate one
 * would be redundant.
 */
export function renderPaymentCompletedInFullEmail(opts: PaymentCompletedInFullEmailOptions): string {
  const { recipientName, jobNumber, customerName, totalPaid, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} has been paid in full.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Paid</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(totalPaid)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} has been paid in full.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Paid in full',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
