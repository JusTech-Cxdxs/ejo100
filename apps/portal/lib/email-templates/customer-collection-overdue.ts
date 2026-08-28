import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerCollectionOverdueEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  daysSinceCancellation: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent only when a Manager or HOD deliberately reviews and triggers
 * it — never automatic, matching the explicit design: a cancelled
 * Job Card's uncollected vehicle is surfaced for staff review once
 * the collection grace period passes, and a human with real
 * authority decides whether and when to actually notify the
 * customer, not a scheduled job.
 */
export function renderCustomerCollectionOverdueEmail(opts: CustomerCollectionOverdueEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, daysSinceCancellation, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Job Card ${escapeHtml(jobNumber)} for your ${escapeHtml(vehicleDescription)} was cancelled ${escapeHtml(daysSinceCancellation)}
      working days ago, and the vehicle is still with us. Please arrange collection as soon as you're able.
    </p>
    <p style="margin: 0 0 16px 0;">
      If you'd like to discuss timing or any other arrangement, please reach out to us directly.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Please arrange collection of your vehicle — Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Please arrange vehicle collection',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
