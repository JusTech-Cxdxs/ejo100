import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobCompletedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  /** This follows a rework — say so, so the customer isn't told the same
   * news twice as if it were new. */
  afterRework?: boolean;
};

/**
 * Fires once, the moment a Job Card's status genuinely transitions to
 * COMPLETED — deliberately NOT the "come collect your vehicle" call.
 * Completed means the quality inspection has passed; Ready for
 * Collection (a separate, later, deliberate step) is the real
 * actionable moment with real logistics attached. This email builds
 * anticipation honestly, without asking the customer to act on
 * something that isn't ready yet.
 */
export function renderCustomerJobCompletedEmail(opts: CustomerJobCompletedEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName, afterRework } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Good news — your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) has passed quality
      inspection. We're finalizing everything now to prepare it for collection, and you'll hear from us again
      shortly with the details.
    </p>
    ${afterRework ? '<p style="margin: 16px 0 0 0; padding: 10px 14px; background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; font-size: 13px; color: #166534;">This follows the additional work we let you know about — it is now complete.</p>' : ''}
  `;

  return renderEmailLayout({
    previewText: `Quality inspection passed — Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Quality inspection passed',
    bodyHtml,
    ctaLabel: 'Track progress',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
