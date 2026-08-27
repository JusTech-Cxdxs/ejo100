import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobCardCancelledEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to the customer once their Job Card's cancellation is approved
 * — deliberately simpler and without the internal request/approval
 * detail staff see (who requested it, who approved it, the internal
 * note) — the customer already knows why they asked, and doesn't need
 * the internal workflow trail, matching the same staff-vs-customer
 * content split already used for every other customer-facing email in
 * this workflow.
 */
export function renderCustomerJobCardCancelledEmail(opts: CustomerJobCardCancelledEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Job Card ${escapeHtml(jobNumber)} for your ${escapeHtml(vehicleDescription)} has been cancelled, as
      requested. If you'd like to bring your vehicle in again in future, we're happy to help whenever you're
      ready.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} has been cancelled.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Your Job Card has been cancelled',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
