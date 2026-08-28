import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerQualityCheckEmailOptions = {
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
 * QUALITY_CHECK — names the real activity (road testing and other
 * checks against standard), not a vague "almost done."
 */
export function renderCustomerQualityCheckEmail(opts: CustomerQualityCheckEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Work on your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) is complete, and our
      Quality Assurance team is now carrying out final checks — including a road test and a full inspection —
      to confirm everything meets the standard we hold every job to before it goes back to you.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Quality checks underway on your vehicle — Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Quality assurance in progress',
    bodyHtml,
    ctaLabel: 'Track progress',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
