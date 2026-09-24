import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerRefundReceiptEmailOptions = {
  customerName: string;
  referenceNumber: string;
  /** "Job Card" or "Vehicle Service". */
  recordLabel: string;
  recordNumber: string;
  vehicleDescription: string;
  amount: string;
  method: string;
  paidToName: string;
  totalRefunded: string;
  /** Still owed back, when the refund is being paid in parts. */
  remaining: string | null;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent the moment Finance records a refund — the customer's own written
 * receipt for money returned, with its RF-number, how it was paid and to
 * whom, and (if paying in parts) what is still to come.
 */
export function renderCustomerRefundReceiptEmail(opts: CustomerRefundReceiptEmailOptions): string {
  const { customerName, referenceNumber, recordLabel, recordNumber, vehicleDescription, amount, method, paidToName, totalRefunded, remaining, dashboardUrl, logoUrl, companyName, branchName } = opts;
  const row = (label: string, value: string) =>
    `<tr><td style="padding: 4px 0; color: #64748B; font-size: 13px;">${escapeHtml(label)}</td><td style="padding: 4px 0; text-align: right; color: #0F172A; font-size: 13px; font-weight: bold;">${escapeHtml(value)}</td></tr>`;
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      We have refunded ${escapeHtml(amount)} for your ${escapeHtml(vehicleDescription)} (${escapeHtml(recordLabel)} ${escapeHtml(recordNumber)}).
      Please keep this email as your receipt.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Refund receipt', referenceNumber)}
          ${row('Amount refunded', amount)}
          ${row('Paid by', method)}
          ${row('Received by', paidToName)}
          ${row('Total refunded so far', totalRefunded)}
          ${remaining ? row('Still to be refunded', remaining) : ''}
        </table>
      </td></tr>
    </table>
    ${remaining ? '<p style="margin: 0; font-size: 13px; color: #64748B;">The remaining balance will be refunded shortly — you will receive a receipt for each payment.</p>' : ''}
  `;
  return renderEmailLayout({
    previewText: `Refund receipt ${referenceNumber} — ${amount} refunded.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your refund receipt',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
