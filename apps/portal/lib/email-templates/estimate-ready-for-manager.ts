import { renderEmailLayout, escapeHtml } from './layout';

export type EstimateReadyForManagerEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  approvedByName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to eligible Workshop Managers once the supervisor has approved
 * an estimate — it's ready for the Manager's own review. A Manager
 * oversees a whole branch, not one department, so this isn't tied to a
 * specific assigned individual the way supervisor/technician emails
 * are — every eligible manager for the branch gets it, and whichever
 * one acts first completes the review.
 */
export function renderEstimateReadyForManagerEmail(opts: EstimateReadyForManagerEmailOptions): string {
  const { managerName, jobNumber, customerName, approvedByName, totalAmount, jobCardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(managerName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByName)} has approved the estimate on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. It's ready for your review before the customer is notified.
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
    previewText: `Estimate for Job Card ${jobNumber} is ready for your review.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate ready for your review',
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
