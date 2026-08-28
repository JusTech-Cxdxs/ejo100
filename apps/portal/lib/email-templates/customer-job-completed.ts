import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobCompletedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
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
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Good news — your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) has passed quality
      inspection. We're finalizing everything now to prepare it for collection, and you'll hear from us again
      shortly with the details.
    </p>
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
