import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobInProgressEmailOptions = {
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
 * IN_PROGRESS — a plain, reassuring update, not a technical one. What
 * a customer actually wants to hear at this stage is "it's happening,
 * it's in good hands, and we'll keep you posted" — not a status code.
 */
export function renderCustomerJobInProgressEmail(opts: CustomerJobInProgressEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Work has begun on your ${escapeHtml(vehicleDescription)} — Job Card ${escapeHtml(jobNumber)}. Our team is on
      it, and we're committed to delivering a job well done, on time. We'll keep you updated as things progress.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Work has begun on your vehicle — Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Your vehicle is now in progress',
    bodyHtml,
    ctaLabel: 'Track progress',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
