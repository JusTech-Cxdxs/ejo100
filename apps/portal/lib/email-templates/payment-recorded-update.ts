import { renderEmailLayout, escapeHtml } from './layout';

export type PaymentRecordedUpdateEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  statusMessage: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real party on a Job Card each time Finance records a
 * payment — genuinely distinct from payment-confirmed-work-can-
 * proceed.ts, which only fires once Finance takes the separate,
 * deliberate "approve and proceed" action. This one is purely
 * informational: a payment came in, here's where things stand
 * cumulatively — it never claims work can start, since that's still
 * a distinct decision Finance makes afterward.
 */
export function renderPaymentRecordedUpdateEmail(opts: PaymentRecordedUpdateEmailOptions): string {
  const { recipientName, jobNumber, customerName, amountReceived, totalPaidSoFar, totalEstimate, statusMessage, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      A payment of ${escapeHtml(amountReceived)} was recorded on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. ${escapeHtml(statusMessage)}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Received So Far</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${amountReceived} received on Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Payment update',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
