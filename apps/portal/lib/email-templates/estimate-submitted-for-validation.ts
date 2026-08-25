import { renderEmailLayout, escapeHtml } from './layout';

export type EstimateSubmittedEmailOptions = {
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  submittedByName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to the supervisor the moment an estimate is submitted for their
 * validation — a real, previously-missing notification for a real
 * two-party event, matching the same pattern already used for every
 * other assignment/decision in this workflow.
 */
export function renderEstimateSubmittedEmail(opts: EstimateSubmittedEmailOptions): string {
  const { supervisorName, jobNumber, customerName, submittedByName, totalAmount, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(supervisorName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(submittedByName)} has finished the estimate on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)} and submitted it for your validation. Please review it, correct anything
      needed, and approve it when ready.
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
    previewText: `Estimate for Job Card ${jobNumber} needs your validation.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate needs your validation',
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
