import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerServicePaymentReceivedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of renderCustomerPaymentReceivedEmail
 * — confirming receipt, not asking for anything further.
 * `balanceRemaining` is omitted once nothing is left to pay.
 */
export function renderCustomerServicePaymentReceivedEmail(opts: CustomerServicePaymentReceivedEmailOptions): string {
  const { customerName, serviceNumber, amountReceived, totalPaidSoFar, totalEstimate, balanceRemaining, serviceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      We've received your payment of ${escapeHtml(amountReceived)} for Vehicle Service ${escapeHtml(serviceNumber)}. Thank you.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Paid</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
          ${balanceRemaining
            ? `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Balance Remaining</p><p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(balanceRemaining)}</p>`
            : `<p style="margin: 0; font-size: 15px; color: #16A34A; font-weight: bold;">Paid in full — thank you.</p>`}
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `We've received your payment of ${amountReceived} for Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Payment received',
    bodyHtml,
    ctaLabel: 'View Details',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
