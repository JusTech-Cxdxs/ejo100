import { renderEmailLayout, escapeHtml } from './layout';

export type EstimateReadyForCustomerNotificationEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approvedByManagerName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to whoever created the Job Card the moment the Manager approves
 * its estimate — the Manager approving is not the same as anyone
 * deciding the customer should be told. That decision belongs to this
 * person specifically: the front-desk/admin staff accountable for the
 * customer relationship, reusing JobCard.createdById rather than a
 * distinct "Admin" role that was never clearly defined. They review,
 * and only once they explicitly notify the customer does that happen.
 */
export function renderEstimateReadyForCustomerNotificationEmail(opts: EstimateReadyForCustomerNotificationEmailOptions): string {
  const { recipientName, jobNumber, customerName, approvedByManagerName, totalAmount, jobCardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByManagerName)} has approved the estimate on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. Please review it, and once you're satisfied everything is in order, notify
      the customer so they can review and proceed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Estimate</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Estimate for Job Card ${jobNumber} is manager-approved — ready to notify the customer.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate approved — ready for the customer',
    bodyHtml,
    ctaLabel: 'Review and notify customer',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
