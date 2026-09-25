// Vehicle Service parallel of customer-job-card-cancelled.ts — kept separate so Job Card's own
// email is never touched (project standing rule).
import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerServiceCancelledEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to the customer once their Vehicle Service's cancellation is approved
 * — deliberately simpler and without the internal request/approval
 * detail staff see (who requested it, who approved it, the internal
 * note) — the customer already knows why they asked, and doesn't need
 * the internal workflow trail, matching the same staff-vs-customer
 * content split already used for every other customer-facing email in
 * this workflow.
 */
export function renderCustomerServiceCancelledEmail(opts: CustomerServiceCancelledEmailOptions): string {
  const { customerName, serviceNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Vehicle Service ${escapeHtml(serviceNumber)} for your ${escapeHtml(vehicleDescription)} has been cancelled, as
      requested. If you'd like to bring your vehicle in again in future, we're happy to help whenever you're
      ready.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Vehicle Service ${serviceNumber} has been cancelled.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Your Vehicle Service has been cancelled',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
